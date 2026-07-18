/**
 * 尽力清理辅助 — 用于临时文件与可处置资源，清理失败应被报告但不替代主结果
 * 参考 openclaw/src/infra/non-fatal-cleanup.ts
 */

/** 运行清理并吞掉失败，调用可选错误钩子后返回 undefined */
export async function runBestEffortCleanup<T>(params: {
  cleanup: () => Promise<T>;
  onError?: (error: unknown) => void;
}): Promise<T | undefined> {
  try {
    return await params.cleanup();
  } catch (error) {
    params.onError?.(error);
    return undefined;
  }
}
