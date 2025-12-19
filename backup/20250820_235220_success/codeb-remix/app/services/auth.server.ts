/**
 * Authentication Service
 * API Key 기반 인증 시스템
 */

import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "./db.server";

const JWT_SECRET = process.env.JWT_SECRET || "codeb-secret-key-change-in-production";
const API_KEY_PREFIX = "cb_";

export interface ApiKey {
  id: string;
  name: string;
  key: string; // 실제 키 (생성 시에만 반환)
  key_hash: string;
  permissions: "read" | "write" | "admin";
  active: boolean;
  last_used?: Date;
  expires_at?: Date;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
}

export interface AuthToken {
  api_key_id: string;
  permissions: string;
  name: string;
}

class AuthService {
  // API 키 생성
  async generateApiKey(
    name: string,
    permissions: "read" | "write" | "admin" = "read",
    expiresInDays?: number,
    createdBy?: string
  ): Promise<{ apiKey: ApiKey; plainKey: string }> {
    // 랜덤 키 생성
    const keyBytes = crypto.randomBytes(32);
    const plainKey = `${API_KEY_PREFIX}${keyBytes.toString("base64url")}`;
    
    // 키 해시 생성
    const keyHash = await bcrypt.hash(plainKey, 10);
    
    // 만료 날짜 설정
    let expiresAt: Date | undefined;
    if (expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }
    
    // DB에 저장
    const apiKey = await db.apiKey.create({
      data: {
        name,
        key_hash: keyHash,
        permissions,
        active: true,
        expires_at: expiresAt,
        created_by: createdBy,
      },
    });
    
    return {
      apiKey: {
        ...apiKey,
        key: plainKey, // 생성 시에만 반환
      },
      plainKey,
    };
  }
  
  // API 키 검증
  async validateApiKey(apiKey: string): Promise<ApiKey | null> {
    try {
      // cb_ 접두사 확인
      if (!apiKey.startsWith(API_KEY_PREFIX)) {
        return null;
      }
      
      // 모든 활성 API 키 조회
      const apiKeys = await db.apiKey.findMany({
        where: { active: true },
      });
      
      // 해시 비교로 일치하는 키 찾기
      for (const key of apiKeys) {
        const isValid = await bcrypt.compare(apiKey, key.key_hash);
        
        if (isValid) {
          // 만료 확인
          if (key.expires_at && new Date() > key.expires_at) {
            await this.deactivateApiKey(key.id);
            return null;
          }
          
          // 마지막 사용 시간 업데이트
          await db.apiKey.update({
            where: { id: key.id },
            data: { last_used: new Date() },
          });
          
          return key;
        }
      }
      
      return null;
    } catch (error) {
      console.error("Failed to validate API key:", error);
      return null;
    }
  }
  
  // JWT 토큰 생성
  generateJWT(apiKey: ApiKey): string {
    const payload: AuthToken = {
      api_key_id: apiKey.id,
      permissions: apiKey.permissions,
      name: apiKey.name,
    };
    
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: "24h",
    });
  }
  
  // JWT 토큰 검증
  verifyJWT(token: string): AuthToken | null {
    try {
      return jwt.verify(token, JWT_SECRET) as AuthToken;
    } catch (error) {
      return null;
    }
  }
  
  // API 키 목록 조회
  async listApiKeys(activeOnly: boolean = true): Promise<ApiKey[]> {
    const where = activeOnly ? { active: true } : {};
    
    const keys = await db.apiKey.findMany({
      where,
      orderBy: { created_at: "desc" },
    });
    
    // key 필드는 제거하고 반환
    return keys.map(({ key_hash, ...key }) => ({
      ...key,
      key_hash,
      key: "[HIDDEN]",
    }));
  }
  
  // API 키 비활성화
  async deactivateApiKey(id: string): Promise<boolean> {
    try {
      await db.apiKey.update({
        where: { id },
        data: { active: false },
      });
      return true;
    } catch (error) {
      console.error("Failed to deactivate API key:", error);
      return false;
    }
  }
  
  // API 키 재활성화
  async reactivateApiKey(id: string): Promise<boolean> {
    try {
      const key = await db.apiKey.findUnique({
        where: { id },
      });
      
      if (!key) {
        return false;
      }
      
      // 만료 확인
      if (key.expires_at && new Date() > key.expires_at) {
        console.error("Cannot reactivate expired key");
        return false;
      }
      
      await db.apiKey.update({
        where: { id },
        data: { active: true },
      });
      
      return true;
    } catch (error) {
      console.error("Failed to reactivate API key:", error);
      return false;
    }
  }
  
  // API 키 삭제
  async deleteApiKey(id: string): Promise<boolean> {
    try {
      await db.apiKey.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      console.error("Failed to delete API key:", error);
      return false;
    }
  }
  
  // API 키 권한 변경
  async updateApiKeyPermissions(
    id: string,
    permissions: "read" | "write" | "admin"
  ): Promise<boolean> {
    try {
      await db.apiKey.update({
        where: { id },
        data: { permissions },
      });
      return true;
    } catch (error) {
      console.error("Failed to update API key permissions:", error);
      return false;
    }
  }
  
  // API 키 이름 변경
  async renameApiKey(id: string, name: string): Promise<boolean> {
    try {
      await db.apiKey.update({
        where: { id },
        data: { name },
      });
      return true;
    } catch (error) {
      console.error("Failed to rename API key:", error);
      return false;
    }
  }
  
  // API 키 만료 연장
  async extendApiKey(id: string, additionalDays: number): Promise<boolean> {
    try {
      const key = await db.apiKey.findUnique({
        where: { id },
      });
      
      if (!key) {
        return false;
      }
      
      const newExpiry = key.expires_at || new Date();
      newExpiry.setDate(newExpiry.getDate() + additionalDays);
      
      await db.apiKey.update({
        where: { id },
        data: { expires_at: newExpiry },
      });
      
      return true;
    } catch (error) {
      console.error("Failed to extend API key:", error);
      return false;
    }
  }
  
  // 권한 확인
  hasPermission(
    apiKey: ApiKey | null,
    requiredPermission: "read" | "write" | "admin"
  ): boolean {
    if (!apiKey || !apiKey.active) {
      return false;
    }
    
    const permissionLevels = {
      read: 1,
      write: 2,
      admin: 3,
    };
    
    return (
      permissionLevels[apiKey.permissions] >= permissionLevels[requiredPermission]
    );
  }
  
  // 요청에서 API 키 추출
  extractApiKey(request: Request): string | null {
    // Authorization 헤더에서 추출
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }
    
    // X-API-Key 헤더에서 추출
    const apiKeyHeader = request.headers.get("X-API-Key");
    if (apiKeyHeader) {
      return apiKeyHeader;
    }
    
    // URL 쿼리 파라미터에서 추출
    const url = new URL(request.url);
    const apiKeyParam = url.searchParams.get("api_key");
    if (apiKeyParam) {
      return apiKeyParam;
    }
    
    return null;
  }
  
  // 인증 미들웨어
  async authenticate(
    request: Request,
    requiredPermission: "read" | "write" | "admin" = "read"
  ): Promise<{ authenticated: boolean; apiKey?: ApiKey; error?: string }> {
    const apiKeyString = this.extractApiKey(request);
    
    if (!apiKeyString) {
      return {
        authenticated: false,
        error: "API key not provided",
      };
    }
    
    const apiKey = await this.validateApiKey(apiKeyString);
    
    if (!apiKey) {
      return {
        authenticated: false,
        error: "Invalid API key",
      };
    }
    
    if (!this.hasPermission(apiKey, requiredPermission)) {
      return {
        authenticated: false,
        error: `Insufficient permissions. Required: ${requiredPermission}`,
      };
    }
    
    return {
      authenticated: true,
      apiKey,
    };
  }
  
  // 초기 관리자 키 생성
  async createInitialAdminKey(): Promise<{ apiKey: ApiKey; plainKey: string } | null> {
    try {
      // 기존 관리자 키 확인
      const existingAdminKeys = await db.apiKey.findMany({
        where: {
          permissions: "admin",
          active: true,
        },
      });
      
      if (existingAdminKeys.length > 0) {
        console.log("Admin key already exists");
        return null;
      }
      
      // 관리자 키 생성
      const result = await this.generateApiKey(
        "Initial Admin Key",
        "admin",
        undefined, // 무기한
        "system"
      );
      
      console.log("========================================");
      console.log("INITIAL ADMIN API KEY CREATED");
      console.log("Please save this key securely!");
      console.log(`API Key: ${result.plainKey}`);
      console.log("========================================");
      
      return result;
    } catch (error) {
      console.error("Failed to create initial admin key:", error);
      return null;
    }
  }
  
  // API 키 통계
  async getApiKeyStats() {
    const allKeys = await db.apiKey.findMany();
    
    const now = new Date();
    const activeKeys = allKeys.filter(k => k.active);
    const expiredKeys = allKeys.filter(
      k => k.expires_at && k.expires_at < now
    );
    
    const keysByPermission = {
      read: allKeys.filter(k => k.permissions === "read").length,
      write: allKeys.filter(k => k.permissions === "write").length,
      admin: allKeys.filter(k => k.permissions === "admin").length,
    };
    
    const recentlyUsed = allKeys.filter(k => {
      if (!k.last_used) return false;
      const daysSinceUse = (now.getTime() - k.last_used.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceUse <= 7;
    });
    
    return {
      total: allKeys.length,
      active: activeKeys.length,
      expired: expiredKeys.length,
      by_permission: keysByPermission,
      recently_used: recentlyUsed.length,
    };
  }
}

export const authService = new AuthService();

// 헬퍼 함수: 인증 확인
export async function requireAuth(
  request: Request,
  permission: "read" | "write" | "admin" = "read"
) {
  const result = await authService.authenticate(request, permission);
  
  if (!result.authenticated) {
    throw new Response(
      JSON.stringify({ error: result.error }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  
  return result.apiKey;
}