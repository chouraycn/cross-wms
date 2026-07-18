// 移植自 openclaw/src/infra/heartbeat-runner.runtime.ts
// 延迟加载心跳运行时 facade，避免测试导入完整的 auto-reply 运行时。
//
// 降级策略：源文件仅 re-export ../auto-reply/reply.js 的 getReplyFromConfig。
// cross-wms 未移植 auto-reply 模块，此处提供降级 stub 抛出明确错误。
// 心跳 runner 在需要时会通过动态 import() 加载此模块，调用 getReplyFromConfig
// 时将抛出 "not implemented" 错误。

export type GetReplyFromConfigFn = (
  ctx: Record<string, unknown>,
  opts: Record<string, unknown>,
  cfg: unknown,
) => Promise<unknown>;

/**
 * 从配置获取回复。
 * 降级实现：抛出错误，cross-wms 未移植 ../auto-reply/reply.js。
 */
export async function getReplyFromConfig(
  _ctx: Record<string, unknown>,
  _opts: Record<string, unknown>,
  _cfg: unknown,
): Promise<unknown> {
  throw new Error(
    "getReplyFromConfig stub: heartbeat-runner.runtime not ported (auto-reply/reply.js missing)",
  );
}
