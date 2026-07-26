// Formatting helpers for model-list terminal tables.
// 移植自 openclaw/src/commands/models/list.format.ts
//
// 降级说明：
//  - isRich / theme 来自 ../../../packages/terminal-core/src/theme.js
//    → 未移植，使用简化实现（不使用终端颜色）

const isRichTerminal = () => false;

const theme = {
  success: (s: string) => s,
  accentBright: (s: string) => s,
  accent: (s: string) => s,
  error: (s: string) => s,
  warn: (s: string) => s,
  accentDim: (s: string) => s,
  muted: (s: string) => s,
  heading: (s: string) => s,
};

export const isRich = (opts?: { json?: boolean; plain?: boolean }) =>
  isRichTerminal() && !opts?.json && !opts?.plain;

export const pad = (value: string, size: number) => value.padEnd(size);

export const formatTag = (tag: string, rich: boolean) => {
  if (!rich) {
    return tag;
  }
  if (tag === "default") {
    return theme.success(tag);
  }
  if (tag === "image") {
    return theme.accentBright(tag);
  }
  if (tag === "configured") {
    return theme.accent(tag);
  }
  if (tag === "missing") {
    return theme.error(tag);
  }
  if (tag.startsWith("fallback#")) {
    return theme.warn(tag);
  }
  if (tag.startsWith("img-fallback#")) {
    return theme.warn(tag);
  }
  if (tag.startsWith("alias:")) {
    return theme.accentDim(tag);
  }
  return theme.muted(tag);
};

export const truncate = (value: string, max: number) => {
  if (value.length <= max) {
    return value;
  }
  if (max <= 3) {
    return value.slice(0, max);
  }
  return `${value.slice(0, max - 3)}...`;
};
