/**
 * 子任务完成消息使用的稳定 announce 标识符。
 * 版本化的 key 让未来格式可以与已持久化的 v1 投递记录共存。
 */
type AnnounceIdFromChildRunParams = {
  childSessionKey: string;
  childRunId: string;
};

/** 构造子会话/运行对的持久化 announce id。 */
export function buildAnnounceIdFromChildRun(params: AnnounceIdFromChildRunParams): string {
  return `v1:${params.childSessionKey}:${params.childRunId}`;
}

/** 构造 announce 投递存储使用的幂等键。 */
export function buildAnnounceIdempotencyKey(announceId: string): string {
  return `announce:${announceId}`;
}
