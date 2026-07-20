/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/stream-wrapper.ts
 *
 * 降级实现：提供 stream object events 包装，不再抛出 stub 错误。
 */

export function wrapStreamObjectEvents(stream: unknown): unknown {
  return stream;
}
