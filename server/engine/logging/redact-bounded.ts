const MAX_REDACT_CHARS = 4 * 1024;
const REDACT_PLACEHOLDER = '<redacted>';

export function redactBounded(text: string, maxChars: number = MAX_REDACT_CHARS): string {
  if (text.length <= maxChars) {
    return text;
  }
  const truncated = text.slice(0, maxChars);
  return `${truncated}...(truncated, ${text.length} total chars)`;
}

export function redactBoundedJson(obj: unknown, maxChars: number = MAX_REDACT_CHARS): string {
  try {
    const json = JSON.stringify(obj);
    return redactBounded(json, maxChars);
  } catch {
    return REDACT_PLACEHOLDER;
  }
}

export function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}...`;
}

export function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  const half = Math.floor(maxChars / 2);
  return `${text.slice(0, half)}...${text.slice(text.length - half)}`;
}
