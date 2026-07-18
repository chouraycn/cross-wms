/**
 * 运行时命令输出解析。
 */

export function parseKeyValueOutput(output: string, separator: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const idx = line.indexOf(separator);
    if (idx <= 0) {
      continue;
    }
    const key = line.slice(0, idx).trim().toLowerCase();
    if (!key) {
      continue;
    }
    const value = line.slice(idx + separator.length).trim();
    entries[key] = value;
  }
  return entries;
}

export function parseNumberValue(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : undefined;
}

export function parseBooleanValue(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase().trim();
  if (lower === "true" || lower === "1" || lower === "yes") return true;
  if (lower === "false" || lower === "0" || lower === "no") return false;
  return undefined;
}
