import { logger } from '../../logger.js';

/**
 * 插件权限系统 — 权限模型 / 权限检查 / 权限请求 / 权限授予
 *
 * v3.1 深化：
 * - 保留原有 setPluginPermissionPolicy / grantPluginPermission 等接口（向后兼容）
 * - 新增：PermissionRequest 流程（异步请求 + 用户授权回调）
 * - 新增：权限分组与默认策略
 * - 新增：批量权限查询与导出/导入
 */

/** 插件权限标识 */
export type PluginPermission =
  | 'network'
  | 'filesystem'
  | 'shell'
  | 'subprocess'
  | 'subagent.spawn'
  | 'tool.register'
  | 'config.write'
  | 'memory.read'
  | 'memory.write'
  | 'channel.send'
  | 'event.emit'
  | 'clipboard.read'
  | 'clipboard.write'
  | 'browser.navigate'
  | 'http.fetch';

/** 权限分组（用于 UI 展示和默认策略） */
export type PluginPermissionGroup =
  | 'network'
  | 'filesystem'
  | 'process'
  | 'memory'
  | 'channel'
  | 'event'
  | 'tool'
  | 'config'
  | 'clipboard'
  | 'browser';

/** 权限策略 */
export interface PluginPermissionPolicy {
  pluginId: string;
  granted: PluginPermission[];
  denied: PluginPermission[];
}

/** 权限请求（运行时由插件主动请求） */
export interface PermissionRequest {
  /** 请求 ID（自动生成） */
  requestId: string;
  pluginId: string;
  permission: PluginPermission;
  /** 请求原因（供用户决策参考） */
  reason?: string;
  /** 创建时间 */
  createdAt: number;
  /** 当前状态 */
  state: PermissionRequestState;
  /** 决策时间 */
  resolvedAt?: number;
  /** 决策者 */
  resolvedBy?: string;
}

/** 权限请求状态 */
export type PermissionRequestState = 'pending' | 'granted' | 'denied' | 'expired';

/** 权限元数据描述 */
export interface PluginPermissionDescriptor {
  permission: PluginPermission;
  group: PluginPermissionGroup;
  label: string;
  description: string;
  /** 是否默认授予（对低风险插件） */
  defaultGrant?: boolean;
  /** 是否需要在 UI 显式确认 */
  requireConfirm?: boolean;
}

/** 权限决策回调 */
export type PermissionResolver = (
  request: PermissionRequest,
) => Promise<{ granted: boolean; reason?: string }>;

// ===================== 权限元数据表 =====================

export const PERMISSION_DESCRIPTORS: Record<PluginPermission, PluginPermissionDescriptor> = {
  'network': {
    permission: 'network',
    group: 'network',
    label: '网络访问',
    description: '允许插件发起任意网络请求',
    requireConfirm: true,
  },
  'http.fetch': {
    permission: 'http.fetch',
    group: 'network',
    label: 'HTTP 请求',
    description: '允许插件通过受限 fetch 接口发起 HTTP 请求',
    defaultGrant: false,
  },
  'filesystem': {
    permission: 'filesystem',
    group: 'filesystem',
    label: '文件系统',
    description: '允许插件读写文件系统',
    requireConfirm: true,
  },
  'shell': {
    permission: 'shell',
    group: 'process',
    label: 'Shell 执行',
    description: '允许插件执行 shell 命令',
    requireConfirm: true,
  },
  'subprocess': {
    permission: 'subprocess',
    group: 'process',
    label: '子进程',
    description: '允许插件启动子进程',
    requireConfirm: true,
  },
  'subagent.spawn': {
    permission: 'subagent.spawn',
    group: 'process',
    label: '子代理启动',
    description: '允许插件启动子代理',
    requireConfirm: true,
  },
  'tool.register': {
    permission: 'tool.register',
    group: 'tool',
    label: '工具注册',
    description: '允许插件注册新工具',
    defaultGrant: true,
  },
  'config.write': {
    permission: 'config.write',
    group: 'config',
    label: '配置写入',
    description: '允许插件修改配置',
    requireConfirm: true,
  },
  'memory.read': {
    permission: 'memory.read',
    group: 'memory',
    label: '记忆读取',
    description: '允许插件读取记忆库',
    defaultGrant: true,
  },
  'memory.write': {
    permission: 'memory.write',
    group: 'memory',
    label: '记忆写入',
    description: '允许插件写入记忆库',
    requireConfirm: true,
  },
  'channel.send': {
    permission: 'channel.send',
    group: 'channel',
    label: '渠道发送',
    description: '允许插件向消息渠道发送消息',
    requireConfirm: true,
  },
  'event.emit': {
    permission: 'event.emit',
    group: 'event',
    label: '事件发送',
    description: '允许插件向事件总线发送事件',
    defaultGrant: true,
  },
  'clipboard.read': {
    permission: 'clipboard.read',
    group: 'clipboard',
    label: '剪贴板读取',
    description: '允许插件读取系统剪贴板',
    requireConfirm: true,
  },
  'clipboard.write': {
    permission: 'clipboard.write',
    group: 'clipboard',
    label: '剪贴板写入',
    description: '允许插件写入系统剪贴板',
    requireConfirm: true,
  },
  'browser.navigate': {
    permission: 'browser.navigate',
    group: 'browser',
    label: '浏览器导航',
    description: '允许插件控制浏览器导航',
    requireConfirm: true,
  },
};

// ===================== 策略存储 =====================

const policies = new Map<string, PluginPermissionPolicy>();
const requests = new Map<string, PermissionRequest>();
let defaultResolver: PermissionResolver | null = null;

export function setPluginPermissionPolicy(policy: PluginPermissionPolicy): void {
  policies.set(policy.pluginId, policy);
  logger.debug(`[Plugins:Permissions] Set policy for ${policy.pluginId}`);
}

export function getPluginPermissionPolicy(pluginId: string): PluginPermissionPolicy | undefined {
  return policies.get(pluginId);
}

export function grantPluginPermission(pluginId: string, permission: PluginPermission): void {
  const policy = policies.get(pluginId) ?? { pluginId, granted: [], denied: [] };
  if (!policy.granted.includes(permission)) policy.granted.push(permission);
  policy.denied = policy.denied.filter((p) => p !== permission);
  policies.set(pluginId, policy);
  logger.debug(`[Plugins:Permissions] Granted ${permission} to ${pluginId}`);
}

export function denyPluginPermission(pluginId: string, permission: PluginPermission): void {
  const policy = policies.get(pluginId) ?? { pluginId, granted: [], denied: [] };
  if (!policy.denied.includes(permission)) policy.denied.push(permission);
  policy.granted = policy.granted.filter((p) => p !== permission);
  policies.set(pluginId, policy);
  logger.debug(`[Plugins:Permissions] Denied ${permission} to ${pluginId}`);
}

export function checkPluginPermission(pluginId: string, permission: PluginPermission): boolean {
  const policy = policies.get(pluginId);
  if (!policy) return false;
  if (policy.denied.includes(permission)) return false;
  return policy.granted.includes(permission);
}

export function clearPluginPermissions(pluginId: string): void {
  policies.delete(pluginId);
  for (const [id, req] of requests) {
    if (req.pluginId === pluginId) requests.delete(id);
  }
}

// ===================== 批量与导出 =====================

export function listAllPermissionPolicies(): PluginPermissionPolicy[] {
  return Array.from(policies.values());
}

export function getGrantedPermissions(pluginId: string): PluginPermission[] {
  const policy = policies.get(pluginId);
  return policy ? [...policy.granted] : [];
}

export function getDeniedPermissions(pluginId: string): PluginPermission[] {
  const policy = policies.get(pluginId);
  return policy ? [...policy.denied] : [];
}

export function listPermissionsByGroup(group: PluginPermissionGroup): PluginPermission[] {
  return (Object.values(PERMISSION_DESCRIPTORS) as PluginPermissionDescriptor[])
    .filter((d) => d.group === group)
    .map((d) => d.permission);
}

export function getPermissionDescriptor(permission: PluginPermission): PluginPermissionDescriptor {
  return PERMISSION_DESCRIPTORS[permission];
}

// ===================== 权限请求流程 =====================

let requestCounter = 0;

function generateRequestId(): string {
  requestCounter += 1;
  return `req-${Date.now()}-${requestCounter}`;
}

export function setPermissionResolver(resolver: PermissionResolver | null): void {
  defaultResolver = resolver;
}

export function createPermissionRequest(
  pluginId: string,
  permission: PluginPermission,
  reason?: string,
): PermissionRequest {
  const request: PermissionRequest = {
    requestId: generateRequestId(),
    pluginId,
    permission,
    reason,
    createdAt: Date.now(),
    state: 'pending',
  };
  requests.set(request.requestId, request);
  logger.debug(
    `[Plugins:Permissions] Request ${request.requestId}: ${pluginId} → ${permission}`,
  );
  return request;
}

export async function requestPermission(
  pluginId: string,
  permission: PluginPermission,
  reason?: string,
): Promise<boolean> {
  if (checkPluginPermission(pluginId, permission)) return true;
  const descriptor = PERMISSION_DESCRIPTORS[permission];
  if (descriptor?.defaultGrant && !getPluginPermissionPolicy(pluginId)?.denied.includes(permission)) {
    grantPluginPermission(pluginId, permission);
    return true;
  }
  if (!defaultResolver) return false;

  const request = createPermissionRequest(pluginId, permission, reason);
  try {
    const decision = await defaultResolver(request);
    request.state = decision.granted ? 'granted' : 'denied';
    request.resolvedAt = Date.now();
    if (decision.granted) {
      grantPluginPermission(pluginId, permission);
    } else {
      denyPluginPermission(pluginId, permission);
    }
    return decision.granted;
  } catch (e) {
    request.state = 'denied';
    request.resolvedAt = Date.now();
    logger.warn(`[Plugins:Permissions] Resolver error for ${request.requestId}:`, e);
    return false;
  }
}

export function getPermissionRequest(requestId: string): PermissionRequest | undefined {
  return requests.get(requestId);
}

export function listPermissionRequests(pluginId?: string): PermissionRequest[] {
  const all = Array.from(requests.values());
  return pluginId ? all.filter((r) => r.pluginId === pluginId) : all;
}

export function expireStaleRequests(maxAgeMs: number): number {
  const now = Date.now();
  let expired = 0;
  for (const [id, req] of requests) {
    if (req.state !== 'pending') continue;
    if (now - req.createdAt > maxAgeMs) {
      req.state = 'expired';
      req.resolvedAt = now;
      expired += 1;
    }
  }
  return expired;
}

/** 测试辅助：清空所有权限数据 */
export function resetPermissionStateForTests(): void {
  policies.clear();
  requests.clear();
  defaultResolver = null;
  requestCounter = 0;
}
