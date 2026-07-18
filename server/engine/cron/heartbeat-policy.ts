/**
 * Cron Heartbeat Policy - 心跳策略
 *
 * 决定 cron 心跳确认何时应保留在可见投递之外。
 * 用于判断任务输出是否仅包含心跳确认文本，从而决定是否跳过投递。
 */

type HeartbeatDeliveryPayload = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  presentation?: unknown;
  interactive?: unknown;
  channelData?: unknown;
};

/**
 * 检测心跳 token 并判断是否应跳过仅心跳确认的投递
 */
function stripHeartbeatToken(
  text: string | undefined,
  opts: { mode: "heartbeat"; maxAckChars: number },
): { shouldSkip: boolean; stripped?: string } {
  if (!text) {
    return { shouldSkip: true };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { shouldSkip: true };
  }
  if (trimmed.length <= opts.maxAckChars) {
    return { shouldSkip: true, stripped: "" };
  }
  const heartbeatPatterns = [
    /^(ok|okay|yes|yep|yup|sure|alright|got it|gotcha|roger|affirmative)/i,
    /^(好的|好|收到|明白了|知道了|嗯|是|对|行|可以|没问题)/,
  ];
  for (const pattern of heartbeatPatterns) {
    if (pattern.test(trimmed) && trimmed.length <= opts.maxAckChars + 5) {
      return { shouldSkip: true, stripped: "" };
    }
  }
  return { shouldSkip: false, stripped: text };
}

/**
 * 检查是否有非文本内容
 */
function hasNonTextContent(payload: HeartbeatDeliveryPayload): boolean {
  if (payload.mediaUrl) return true;
  if (payload.mediaUrls && payload.mediaUrls.length > 0) return true;
  if (payload.presentation) return true;
  if (payload.interactive) return true;
  if (payload.channelData) return true;
  return false;
}

/**
 * 返回投递输出是否仅包含心跳确认文本
 */
export function shouldSkipHeartbeatOnlyDelivery(
  payloads: HeartbeatDeliveryPayload[],
  ackMaxChars: number,
): boolean {
  if (payloads.length === 0) {
    return true;
  }
  const hasAnyNonTextContent = payloads.some((payload) => hasNonTextContent(payload));
  if (hasAnyNonTextContent) {
    return false;
  }
  return payloads.some((payload) => {
    const result = stripHeartbeatToken(payload.text, {
      mode: "heartbeat",
      maxAckChars: ackMaxChars,
    });
    return result.shouldSkip;
  });
}
