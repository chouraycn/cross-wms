/**
 * Agent 压缩相关常量。
 *
 * 当上下文窗口足够大，导致 `contextTokenBudget * MIN_PROMPT_BUDGET_RATIO`
 * 超过该绝对值时，该绝对下限优先生效。
 */
export const MIN_PROMPT_BUDGET_TOKENS = 8_000;

/**
 * 上下文窗口中扣除保留 token 之后，必须为 prompt 内容保留的最小比例。
 */
export const MIN_PROMPT_BUDGET_RATIO = 0.5;
