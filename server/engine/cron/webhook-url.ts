// 规范化 cron webhook 目标 URL

function isAllowedWebhookProtocol(protocol: string): boolean {
  return protocol === "http:" || protocol === "https:";
}

/** 规范化 cron webhook URL，拒绝空值、格式错误与非 HTTP(S) 值 */
export function normalizeHttpWebhookUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (!isAllowedWebhookProtocol(parsed.protocol)) {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}
