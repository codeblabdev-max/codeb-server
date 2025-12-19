/**
 * API Route: /api/auth/init
 * 초기 관리자 키 생성 엔드포인트
 */

import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { authService } from "~/services/auth.server";
import * as fs from "fs/promises";
import * as path from "path";

// POST /api/auth/init - 초기 관리자 키 생성
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  
  // 로컬 요청인지 확인 (보안)
  const host = request.headers.get("host");
  const isLocal = host?.startsWith("localhost") || host?.startsWith("127.0.0.1");
  
  if (!isLocal && process.env.NODE_ENV === "production") {
    return json({ error: "Init can only be called from localhost" }, { status: 403 });
  }
  
  // 초기 관리자 키 생성
  const result = await authService.createInitialAdminKey();
  
  if (!result) {
    return json({ 
      error: "Admin key already exists or creation failed",
      message: "An admin key already exists. Use the existing key or delete it first."
    }, { status: 400 });
  }
  
  // 키를 파일로도 저장 (안전을 위해)
  const keyFilePath = path.join(process.cwd(), "data", "admin-key.txt");
  const keyContent = `
========================================
CodeB Admin API Key
Generated: ${new Date().toISOString()}
========================================

API Key: ${result.plainKey}
Name: ${result.apiKey.name}
Permissions: ${result.apiKey.permissions}
ID: ${result.apiKey.id}

========================================
IMPORTANT: Save this key securely!
This key will not be shown again.
========================================

Usage Examples:

1. CLI Configuration:
   codeb config set api_key ${result.plainKey}

2. HTTP Header:
   Authorization: Bearer ${result.plainKey}
   or
   X-API-Key: ${result.plainKey}

3. Query Parameter:
   ?api_key=${result.plainKey}
`;
  
  try {
    await fs.mkdir(path.dirname(keyFilePath), { recursive: true });
    await fs.writeFile(keyFilePath, keyContent, "utf-8");
  } catch (error) {
    console.error("Failed to save key to file:", error);
  }
  
  return json({
    success: true,
    message: "Initial admin key created successfully",
    apiKey: {
      id: result.apiKey.id,
      name: result.apiKey.name,
      permissions: result.apiKey.permissions,
      key: result.plainKey,
    },
    savedTo: keyFilePath,
    warning: "This key will not be shown again. Please save it securely!",
  });
}