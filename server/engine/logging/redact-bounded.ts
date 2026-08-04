const MAX_REDACT_CHARS = 4 * 1024;
const REDACT_PLACEHOLDER = '<redacted>';

const REDACT_REGEX_CHUNK_THRESHOLD = 32_768;
const REDACT_REGEX_CHUNK_SIZE = 16_384;

type BoundedRedactOptions = {
  chunkThreshold?: number;
  chunkSize?: number;
};

/** Applies a regex replacement in chunks once input crosses the redaction size threshold. */
export function replacePatternBounded(
  text: string,
  pattern: RegExp,
  replacer: Parameters<string['replace']>[1],
  options?: BoundedRedactOptions,
): string {
  const chunkThreshold = options?.chunkThreshold ?? REDACT_REGEX_CHUNK_THRESHOLD;
  const chunkSize = options?.chunkSize ?? REDACT_REGEX_CHUNK_SIZE;
  if (chunkThreshold <= 0 || chunkSize <= 0 || text.length <= chunkThreshold) {
    return text.replace(pattern, replacer);
  }

  let output = '';
  // Chunking may miss matches spanning chunk boundaries; use only for token-like redaction patterns.
  for (let index = 0; index < text.length; index += chunkSize) {
    output += text.slice(index, index + chunkSize).replace(pattern, replacer);
  }
  return output;
}

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
