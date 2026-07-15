/**
 * 方法作用域 — 参考 OpenClaw gateway/method-scopes.ts
 *
 * 将静态和插件定义的网关方法映射到操作员作用域。
 */

export type OperatorScope =
  | 'admin'
  | 'read'
  | 'write'
  | 'approvals'
  | 'pairing'
  | 'talk_secrets';

export const ADMIN_SCOPE: OperatorScope = 'admin';
export const READ_SCOPE: OperatorScope = 'read';
export const WRITE_SCOPE: OperatorScope = 'write';
export const APPROVALS_SCOPE: OperatorScope = 'approvals';
export const PAIRING_SCOPE: OperatorScope = 'pairing';
export const TALK_SECRETS_SCOPE: OperatorScope = 'talk_secrets';

export const CLI_DEFAULT_OPERATOR_SCOPES: OperatorScope[] = [
  ADMIN_SCOPE,
  READ_SCOPE,
  WRITE_SCOPE,
  APPROVALS_SCOPE,
  PAIRING_SCOPE,
  TALK_SECRETS_SCOPE,
];

const CORE_METHOD_SCOPES: Record<string, OperatorScope> = {
  'config.get': READ_SCOPE,
  'config.set': WRITE_SCOPE,
  'config.list': READ_SCOPE,
  'chat.send': WRITE_SCOPE,
  'chat.history': READ_SCOPE,
  'chat.delete': WRITE_SCOPE,
  'models.list': READ_SCOPE,
  'agents.list': READ_SCOPE,
  'agents.create': WRITE_SCOPE,
  'agents.update': WRITE_SCOPE,
  'agents.delete': WRITE_SCOPE,
  'nodes.list': READ_SCOPE,
  'nodes.status': READ_SCOPE,
  'nodes.invoke': WRITE_SCOPE,
  'nodes.pair': PAIRING_SCOPE,
  'nodes.unpair': PAIRING_SCOPE,
  'approvals.list': APPROVALS_SCOPE,
  'approvals.approve': APPROVALS_SCOPE,
  'approvals.reject': APPROVALS_SCOPE,
  'system.status': READ_SCOPE,
  'system.restart': ADMIN_SCOPE,
  'system.shutdown': ADMIN_SCOPE,
};

const NODE_ROLE_METHODS = new Set([
  'nodes.invoke',
  'nodes.status',
  'nodes.pair',
]);

export function isOperatorScope(scope: string): scope is OperatorScope {
  return [
    ADMIN_SCOPE,
    READ_SCOPE,
    WRITE_SCOPE,
    APPROVALS_SCOPE,
    PAIRING_SCOPE,
    TALK_SECRETS_SCOPE,
  ].includes(scope as OperatorScope);
}

export function isApprovalMethod(method: string): boolean {
  return resolveRequiredOperatorScopeForMethod(method) === APPROVALS_SCOPE;
}

export function isNodeRoleMethod(method: string): boolean {
  return NODE_ROLE_METHODS.has(method);
}

export function isAdminOnlyMethod(method: string): boolean {
  return resolveRequiredOperatorScopeForMethod(method) === ADMIN_SCOPE;
}

export function resolveRequiredOperatorScopeForMethod(method: string): OperatorScope | undefined {
  return CORE_METHOD_SCOPES[method];
}