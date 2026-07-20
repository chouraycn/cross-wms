/**
 * 移植自 openclaw/src/agents/auth-profiles/failure-hook.ts
 *
 * 降级实现：提供 auth profile 失败钩子，不再抛出 stub 错误。
 */

type FailureHook = (error: Error, provider: string) => void;
let hook: FailureHook | undefined;

export function setAuthProfileFailureHook(fn: FailureHook | undefined): void {
  hook = fn;
}

export function notifyAuthProfileFailureHook(error: Error, provider: string): void {
  hook?.(error, provider);
}
