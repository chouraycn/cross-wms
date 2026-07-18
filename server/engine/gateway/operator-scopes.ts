// Gateway operator scope 常量。
// 定义连接 auth 与 method policy 接受的封闭集合。
// 移植自 openclaw/src/gateway/operator-scopes.ts（纯常量与类型，无外部依赖）。

export const ADMIN_SCOPE = "operator.admin" as const;
export const READ_SCOPE = "operator.read" as const;
export const WRITE_SCOPE = "operator.write" as const;
export const APPROVALS_SCOPE = "operator.approvals" as const;
export const PAIRING_SCOPE = "operator.pairing" as const;
export const TALK_SECRETS_SCOPE = "operator.talk.secrets" as const;

/** 由 gateway auth 声明、由 method policy 检查的 operator 权限。 */
export type OperatorScope =
  | typeof ADMIN_SCOPE
  | typeof READ_SCOPE
  | typeof WRITE_SCOPE
  | typeof APPROVALS_SCOPE
  | typeof PAIRING_SCOPE
  | typeof TALK_SECRETS_SCOPE;

const KNOWN_OPERATOR_SCOPE_VALUES: readonly OperatorScope[] = [
  ADMIN_SCOPE,
  READ_SCOPE,
  WRITE_SCOPE,
  APPROVALS_SCOPE,
  PAIRING_SCOPE,
  TALK_SECRETS_SCOPE,
];

const KNOWN_OPERATOR_SCOPES: ReadonlySet<OperatorScope> = new Set(KNOWN_OPERATOR_SCOPE_VALUES);

/** 将不可信的 auth-token scope 条目收窄到 gateway 的封闭 scope 集合。 */
export function isOperatorScope(value: unknown): value is OperatorScope {
  return typeof value === "string" && KNOWN_OPERATOR_SCOPES.has(value as OperatorScope);
}
