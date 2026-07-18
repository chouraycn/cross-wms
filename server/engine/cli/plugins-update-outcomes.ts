// 用户面向的插件与 hook-pack 更新结果日志输出。
// 移植自 openclaw/src/cli/plugins-update-outcomes.ts。
//
// 降级策略：
//  - 原模块依赖 `../../packages/terminal-core/src/theme.js` 的 `theme`。
//    cross-wms 未移植 terminal-core 包；这里内联一个 theme stub，
//    仅提供 `error`/`warn` 格式化方法，直接返回输入字符串不应用 ANSI 颜色，
//    保持 CLI 输出为纯文本。未来 cross-wms 移植 terminal-core 后可替换为正式实现。

// ===== 内联 theme stub（替代未移植的 terminal-core/theme.js）=====
const theme = {
  error(value: string): string {
    return value;
  },
  warn(value: string): string {
    return value;
  },
};
// ===== theme stub 结束 =====

type PluginUpdateCliOutcome = {
  status: string;
  message: string;
  channelFallback?: {
    message: string;
  };
};

/** Log update outcomes with severity styling and report whether any errors occurred. */
export function logPluginUpdateOutcomes(params: {
  outcomes: readonly PluginUpdateCliOutcome[];
  log: (message: string) => void;
}): { hasErrors: boolean } {
  let hasErrors = false;
  for (const outcome of params.outcomes) {
    if (outcome.status === "error") {
      hasErrors = true;
      params.log(theme.error(outcome.message));
      if (outcome.channelFallback) {
        params.log(theme.warn(outcome.channelFallback.message));
      }
      continue;
    }
    if (outcome.status === "skipped") {
      params.log(theme.warn(outcome.message));
      if (outcome.channelFallback) {
        params.log(theme.warn(outcome.channelFallback.message));
      }
      continue;
    }
    params.log(outcome.message);
    if (outcome.channelFallback) {
      params.log(theme.warn(outcome.channelFallback.message));
    }
  }
  return { hasErrors };
}
