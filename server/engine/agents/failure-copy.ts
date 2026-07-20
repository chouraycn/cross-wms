/**
 * 移植自 openclaw/src/agents/auth-profiles/failure-copy.ts
 *
 * 降级实现：提供 auth profile 失败消息格式化，不再抛出 stub 错误。
 */

export function formatAuthProfileFailureMessage(params: {
  error?: Error | unknown;
  provider?: string;
}): string {
  const error = params.error;
  const msg = error instanceof Error ? error.message : String(error ?? "unknown error");
  return `Auth profile failure for ${params.provider ?? "unknown"}: ${msg}`;
}
