// Gateway 方法鉴权 scope 解析器。
// 将静态与插件定义的 gateway 方法映射到 operator scope。
// 移植自 openclaw/src/gateway/method-scopes.ts。
// 依赖调整：
//  - @openclaw/normalization-core/string-coerce → ../infra/string-coerce.js
//  - ../plugins/runtime-state.js、../shared/gateway-method-policy.js → 本地 _openclaw-stubs.ts（降级占位）
//  - ./methods/core-descriptors.js、./operator-scopes.js（均已移植）
import { normalizeOptionalString as normalizeSessionActionParam } from "../infra/string-coerce.js";
import { getPluginRegistryState } from "./_openclaw-stubs.js";
import { resolveReservedGatewayMethodScope } from "./_openclaw-stubs.js";
import {
  isCoreGatewayMethodClassified,
  isCoreNodeGatewayMethod,
  isDynamicOperatorGatewayMethod,
  resolveCoreOperatorGatewayMethodScope,
} from "./methods/core-descriptors.js";
import {
  ADMIN_SCOPE,
  APPROVALS_SCOPE,
  PAIRING_SCOPE,
  READ_SCOPE,
  TALK_SECRETS_SCOPE,
  WRITE_SCOPE,
  isOperatorScope,
  type OperatorScope,
} from "./operator-scopes.js";

export {
  ADMIN_SCOPE,
  APPROVALS_SCOPE,
  PAIRING_SCOPE,
  READ_SCOPE,
  TALK_SECRETS_SCOPE,
  WRITE_SCOPE,
  type OperatorScope,
};

/** 当无更窄的本地策略已知时授予 CLI/operator 客户端的默认 scope。 */
export const CLI_DEFAULT_OPERATOR_SCOPES: OperatorScope[] = [
  ADMIN_SCOPE,
  READ_SCOPE,
  WRITE_SCOPE,
  APPROVALS_SCOPE,
  PAIRING_SCOPE,
  TALK_SECRETS_SCOPE,
];

function resolveScopedMethod(method: string): OperatorScope | undefined {
  // core descriptor 是权威的，然后是保留命名空间策略，然后是活动插件 descriptor。
  // node/dynamic 哨兵被刻意排除在 operator scope 之外。
  const explicitScope = resolveCoreOperatorGatewayMethodScope(method);
  if (explicitScope) {
    return explicitScope;
  }
  const reservedScope = resolveReservedGatewayMethodScope(method);
  if (reservedScope) {
    return reservedScope;
  }
  const pluginDescriptor = (getPluginRegistryState() as { activeRegistry?: { gatewayMethodDescriptors?: Array<{ name: string; scope?: string }> } } | undefined)?.activeRegistry?.gatewayMethodDescriptors?.find(
    (descriptor) => descriptor.name === method,
  );
  const pluginScope = pluginDescriptor?.scope;
  return pluginScope === "node" || pluginScope === "dynamic" ? undefined : (pluginScope as OperatorScope | undefined);
}

/** 当方法需要 approvals operator scope 时返回 true。 */
export function isApprovalMethod(method: string): boolean {
  return resolveScopedMethod(method) === APPROVALS_SCOPE;
}

/** 当方法保留给 node-role 客户端而非 operator 时返回 true。 */
export function isNodeRoleMethod(method: string): boolean {
  return isCoreNodeGatewayMethod(method);
}

/** 当方法需要 admin operator scope 时返回 true。 */
export function isAdminOnlyMethod(method: string): boolean {
  return resolveScopedMethod(method) === ADMIN_SCOPE;
}

/** 解析 gateway 方法的所需静态 operator scope（若存在）。 */
export function resolveRequiredOperatorScopeForMethod(method: string): OperatorScope | undefined {
  return resolveScopedMethod(method);
}

function resolveSessionActionRegisteredScopes(params: unknown): OperatorScope[] | undefined {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return undefined;
  }
  const pluginId = normalizeSessionActionParam((params as { pluginId?: unknown }).pluginId);
  const actionId = normalizeSessionActionParam((params as { actionId?: unknown }).actionId);
  if (!pluginId || !actionId) {
    return undefined;
  }
  const registration = (getPluginRegistryState() as { activeRegistry?: { sessionActions?: Array<{ pluginId: string; action: { id: string; requiredScopes?: OperatorScope[] }; scope?: OperatorScope }> } } | undefined)?.activeRegistry?.sessionActions?.find(
    (entry) => entry.pluginId === pluginId && entry.action.id === actionId,
  );
  if (!registration) {
    return undefined;
  }
  const requiredScopes = registration.action.requiredScopes;
  // 已注册的 session action 在省略自定义要求时默认为 write scope；这保留了历史变更边界。
  return requiredScopes && requiredScopes.length > 0 ? [...requiredScopes] : [WRITE_SCOPE];
}

function resolveSessionActionLeastPrivilegeScopes(params: unknown): OperatorScope[] {
  const registeredScopes = resolveSessionActionRegisteredScopes(params);
  if (registeredScopes) {
    return registeredScopes;
  }
  if (params && typeof params === "object" && !Array.isArray(params)) {
    const pluginId = normalizeSessionActionParam((params as { pluginId?: unknown }).pluginId);
    const actionId = normalizeSessionActionParam((params as { actionId?: unknown }).actionId);
    if (pluginId && actionId) {
      // 一个独立的 CLI/tool 调用方可能在与一个本地进程不存在活动插件注册表的 gateway 通信。
      // 避免在无法本地确定确切要求时对有效的动态 action 欠授权。
      return [...CLI_DEFAULT_OPERATOR_SCOPES];
    }
  }
  return [WRITE_SCOPE];
}

function resolveDynamicLeastPrivilegeOperatorScopesForMethod(
  method: string,
  params: unknown,
): OperatorScope[] {
  // 动态方法从 params 与活动插件注册表派生鉴权，而非单一静态方法 scope。
  if (method === "plugins.sessionAction") {
    return resolveSessionActionLeastPrivilegeScopes(params);
  }
  return [WRITE_SCOPE];
}

/** 返回调用一个 gateway 方法所需的最窄已知 operator scope。 */
export function resolveLeastPrivilegeOperatorScopesForMethod(
  method: string,
  params?: unknown,
): OperatorScope[] {
  if (isDynamicOperatorGatewayMethod(method)) {
    return resolveDynamicLeastPrivilegeOperatorScopesForMethod(method, params);
  }
  const requiredScope = resolveRequiredOperatorScopeForMethod(method);
  if (requiredScope) {
    return [requiredScope];
  }
  // 对未分类方法默认拒绝。
  return [];
}

/** 检查一组出示的 operator scope 是否授权某个 gateway 方法调用。 */
export function authorizeOperatorScopesForMethod(
  method: string,
  scopes: readonly string[],
  params?: unknown,
): { allowed: true } | { allowed: false; missingScope: OperatorScope } {
  if (scopes.includes(ADMIN_SCOPE)) {
    return { allowed: true };
  }
  if (isDynamicOperatorGatewayMethod(method)) {
    const registeredScopes = resolveSessionActionRegisteredScopes(params);
    if (!registeredScopes && params && typeof params === "object" && !Array.isArray(params)) {
      const pluginId = normalizeSessionActionParam((params as { pluginId?: unknown }).pluginId);
      const actionId = normalizeSessionActionParam((params as { actionId?: unknown }).actionId);
      if (!pluginId || !actionId) {
        // 畸形动态参数无法匹配到插件 action。任意有效 operator scope 可继续，
        // 以便 handler 返回精确的校验错误。
        return scopes.some((scope) => isOperatorScope(scope))
          ? { allowed: true }
          : { allowed: false, missingScope: WRITE_SCOPE };
      }
    }
    const requiredScopes = registeredScopes ?? [WRITE_SCOPE];
    const missingScope = requiredScopes.find((scope) => {
      return !scopes.includes(scope) && !(scope === READ_SCOPE && scopes.includes(WRITE_SCOPE));
    });
    return missingScope ? { allowed: false, missingScope } : { allowed: true };
  }
  const requiredScope = resolveRequiredOperatorScopeForMethod(method) ?? ADMIN_SCOPE;
  return authorizeOperatorScopesForRequiredScope(requiredScope, scopes);
}

/** 检查方法注册表已解析的静态 scope 是否匹配出示的 operator scope。 */
export function authorizeOperatorScopesForRequiredScope(
  requiredScope: OperatorScope,
  scopes: readonly string[],
): { allowed: true } | { allowed: false; missingScope: OperatorScope } {
  if (scopes.includes(ADMIN_SCOPE)) {
    return { allowed: true };
  }
  if (requiredScope === READ_SCOPE) {
    if (scopes.includes(READ_SCOPE) || scopes.includes(WRITE_SCOPE)) {
      return { allowed: true };
    }
    return { allowed: false, missingScope: READ_SCOPE };
  }
  if (scopes.includes(requiredScope)) {
    return { allowed: true };
  }
  return { allowed: false, missingScope: requiredScope };
}

/** 当方法有任何 core、node、dynamic、reserved 或插件 scope 策略时返回 true。 */
export function isGatewayMethodClassified(method: string): boolean {
  if (isNodeRoleMethod(method)) {
    return true;
  }
  if (isDynamicOperatorGatewayMethod(method)) {
    return true;
  }
  return (
    isCoreGatewayMethodClassified(method) ||
    resolveRequiredOperatorScopeForMethod(method) !== undefined
  );
}
