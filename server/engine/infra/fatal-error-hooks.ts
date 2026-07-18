/** 在进程退出前传递给 fatal-error 钩子的上下文。 */
type FatalErrorHookContext = {
  reason: string;
  error?: unknown;
};

/** 可返回一条额外诊断行的 fatal-error 钩子。 */
type FatalErrorHook = (context: FatalErrorHookContext) => string | undefined | void;

const hooks = new Set<FatalErrorHook>();

function formatHookFailure(error: unknown): string {
  const name = error instanceof Error && error.name ? error.name : "unknown";
  return `fatal-error hook failed: ${name}`;
}

/** 注册 fatal-error 钩子并返回取消订阅回调。 */
export function registerFatalErrorHook(hook: FatalErrorHook): () => void {
  hooks.add(hook);
  return () => {
    hooks.delete(hook);
  };
}

/** 运行已注册的 fatal-error 钩子并返回非空诊断行。 */
export function runFatalErrorHooks(context: FatalErrorHookContext): string[] {
  const messages: string[] = [];
  for (const hook of hooks) {
    try {
      const message = hook(context);
      if (typeof message === "string" && message.trim()) {
        messages.push(message);
      }
    } catch (err) {
      // 即使诊断钩子本身抛出异常，fatal 输出也必须继续推进。
      messages.push(formatHookFailure(err));
    }
  }
  return messages;
}

/** 清除已注册的 fatal-error 钩子；仅用于测试。 */
export function resetFatalErrorHooksForTest(): void {
  hooks.clear();
}
