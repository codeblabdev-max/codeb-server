/**
 * API Route: /api/auth/keys
 * API 키 관리 엔드포인트
 */

import { json } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { authService, requireAuth } from "~/services/auth.server";

// GET /api/auth/keys - API 키 목록 조회
export async function loader({ request }: LoaderFunctionArgs) {
  // 관리자 권한 필요
  await requireAuth(request, "admin");
  
  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("active") !== "false";
  
  const keys = await authService.listApiKeys(activeOnly);
  const stats = await authService.getApiKeyStats();
  
  return json({ keys, stats });
}

// POST /api/auth/keys - 새 API 키 생성
export async function action({ request }: ActionFunctionArgs) {
  // 관리자 권한 필요
  const apiKey = await requireAuth(request, "admin");
  
  if (request.method === "POST") {
    const body = await request.json();
    const { name, permissions, expiresInDays } = body;
    
    if (!name) {
      return json({ error: "Name is required" }, { status: 400 });
    }
    
    const validPermissions = ["read", "write", "admin"];
    if (permissions && !validPermissions.includes(permissions)) {
      return json({ error: "Invalid permissions" }, { status: 400 });
    }
    
    const result = await authService.generateApiKey(
      name,
      permissions || "read",
      expiresInDays,
      apiKey.id
    );
    
    return json({
      success: true,
      apiKey: result.apiKey,
      plainKey: result.plainKey,
      message: "API key created successfully. Please save the key securely!",
    });
  }
  
  if (request.method === "DELETE") {
    const body = await request.json();
    const { id } = body;
    
    if (!id) {
      return json({ error: "ID is required" }, { status: 400 });
    }
    
    const success = await authService.deleteApiKey(id);
    
    if (!success) {
      return json({ error: "Failed to delete API key" }, { status: 500 });
    }
    
    return json({ success: true, message: "API key deleted" });
  }
  
  if (request.method === "PATCH") {
    const body = await request.json();
    const { id, action: patchAction, ...data } = body;
    
    if (!id || !patchAction) {
      return json({ error: "ID and action are required" }, { status: 400 });
    }
    
    let success = false;
    let message = "";
    
    switch (patchAction) {
      case "deactivate":
        success = await authService.deactivateApiKey(id);
        message = "API key deactivated";
        break;
        
      case "reactivate":
        success = await authService.reactivateApiKey(id);
        message = "API key reactivated";
        break;
        
      case "rename":
        if (!data.name) {
          return json({ error: "Name is required" }, { status: 400 });
        }
        success = await authService.renameApiKey(id, data.name);
        message = "API key renamed";
        break;
        
      case "updatePermissions":
        if (!data.permissions) {
          return json({ error: "Permissions are required" }, { status: 400 });
        }
        success = await authService.updateApiKeyPermissions(id, data.permissions);
        message = "Permissions updated";
        break;
        
      case "extend":
        if (!data.days || data.days <= 0) {
          return json({ error: "Days must be positive" }, { status: 400 });
        }
        success = await authService.extendApiKey(id, data.days);
        message = "API key expiry extended";
        break;
        
      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
    
    if (!success) {
      return json({ error: `Failed to ${patchAction} API key` }, { status: 500 });
    }
    
    return json({ success: true, message });
  }
  
  return json({ error: "Method not allowed" }, { status: 405 });
}