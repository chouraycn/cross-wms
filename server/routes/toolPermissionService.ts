import { EventEmitter } from 'events';
import { getAppSettings, setAppSettings } from '../dao/settings.js';
import { logger } from '../logger.js';

// v1.9.2: 工具权限请求全局 EventEmitter
export const permissionEmitter = new EventEmitter();

// v2.3.3: reqId → { toolName, sessionId } 映射，用于持久化 "始终允许"
const reqIdToolMap = new Map<string, { toolName: string; sessionId: string }>();

// v1.9.6: Session 级工具授权缓存 — 同一会话内，工具授权一次后不再重复授权
// key 为 sessionId，value 为该 session 已授权的工具名称集合
const sessionApprovedToolsCache = new Map<string, Set<string>>();

// v2.3.3: 全局始终允许的工具集合（持久化到 DB，跨会话）
let globalAlwaysAllowed: Set<string> | null = null;

/** v2.3.3: 加载全局始终允许的工具列表 */
export function loadAlwaysAllowedTools(): Set<string> {
  if (globalAlwaysAllowed) return globalAlwaysAllowed;
  try {
    const val = getAppSettings('always_allowed_tools');
    globalAlwaysAllowed = val ? new Set(JSON.parse(val)) : new Set();
  } catch {
    globalAlwaysAllowed = new Set();
  }
  return globalAlwaysAllowed;
}

/** v2.5.0: 检查工具是否在始终允许列表中（支持通配符前缀匹配 mcp__server__* 等） */
export function isToolAlwaysAllowed(toolName: string): boolean {
  const allowed = loadAlwaysAllowedTools();
  if (allowed.has(toolName)) return true;
  // 通配符匹配：检查是否有 `prefix*` 模式匹配
  for (const pattern of allowed) {
    if (pattern.endsWith('*') && toolName.startsWith(pattern.slice(0, -1))) {
      return true;
    }
  }
  return false;
}

/** v1.5.66: 检查系统授权是否已启用 */
export function isSystemAuthorized(): boolean {
  try {
    const val = getAppSettings('systemAuthorization');
    if (!val) return false;
    const config = JSON.parse(val);
    return config.enabled === true;
  } catch {
    return false;
  }
}

/** 获取会话级已授权工具集合 */
export function getSessionApprovedTools(sessionId: string): Set<string> {
  return sessionApprovedToolsCache.get(sessionId) ?? new Set<string>();
}

/** 初始化会话级授权缓存（注入全局白名单） */
export function initSessionApprovedTools(sessionId: string): Set<string> {
  if (!sessionApprovedToolsCache.has(sessionId)) {
    const set = new Set<string>();
    for (const t of loadAlwaysAllowedTools()) {
      set.add(t);
    }
    sessionApprovedToolsCache.set(sessionId, set);
  }
  return sessionApprovedToolsCache.get(sessionId)!;
}

/** 注册权限请求映射 */
export function registerPermissionRequest(reqId: string, toolName: string, sessionId: string): void {
  reqIdToolMap.set(reqId, { toolName, sessionId });
}

/** 处理权限响应 */
export function handlePermissionResponse(reqId: string, approved: boolean, alwaysAllow?: boolean, toolCategory?: string): void {
  if (alwaysAllow) {
    const info = reqIdToolMap.get(reqId);
    if (info) {
      const { toolName, sessionId } = info;
      try {
        loadAlwaysAllowedTools();
        // 优先存储类别通配符（如 mcp__tencent_docs__*），否则存储精确工具名
        const patternToStore = toolCategory || toolName;
        globalAlwaysAllowed!.add(patternToStore);
        // 如果存储了通配符，也把当前工具名加入（即时生效）
        if (toolCategory && toolCategory !== toolName) {
          globalAlwaysAllowed!.add(toolName);
        }
        setAppSettings('always_allowed_tools', JSON.stringify([...globalAlwaysAllowed!]));
        // 同时注入当前会话缓存
        const sessionCache = sessionApprovedToolsCache.get(sessionId);
        if (sessionCache) {
          sessionCache.add(patternToStore);
          if (toolCategory && toolCategory !== toolName) {
            sessionCache.add(toolName);
          }
        }
      } catch (e) {
        logger.warn('[permission-response] 持久化 alwaysAllow 失败:', e);
      }
    }
    reqIdToolMap.delete(reqId);
  }
  // 通过 EventEmitter 通知对应的 chat 请求
  permissionEmitter.emit(reqId, approved === true);
}

/** 清理会话级缓存 */
export function clearSessionApprovedTools(sessionId: string): void {
  sessionApprovedToolsCache.delete(sessionId);
}
