// Terminal/JSON/plain table renderer for model-list rows.
// 移植自 openclaw/src/commands/models/list.table.ts
//
// 降级说明：
//  - sanitizeTerminalText 来自 ../../../packages/terminal-core/src/safe-text.js
//    → cross-wms 未移植 terminal-core，使用本地 identity 实现（不转义）
//  - colorize / theme 来自 ../../../packages/terminal-core/src/theme.js
//    → cross-wms 未移植，使用本地降级实现（不应用颜色），与 ./list.format.ts 保持一致
//  - RuntimeEnv / writeRuntimeJson 来自 ../../runtime.js
//    → cross-wms 未移植 runtime.ts，使用本地最小化类型与 JSON 输出实现
//  - formatTokenK 来自 ./shared.js
//    → cross-wms 未移植 shared.ts，使用本地等价实现
//  - formatTag / isRich / pad / truncate 来自 ./list.format.js → cross-wms 已移植
//  - ModelRow 来自 ./list.types.js → cross-wms 已移植
import { formatTag, isRich, pad, truncate } from "./list.format.js";
import type { ModelRow } from "./list.types.js";

/** Minimal runtime environment used by model-list table rendering. */
export type RuntimeEnv = {
  log: (message: string) => void;
};

/** Identity sanitizer — preserves terminal text as-is when terminal-core is unavailable. */
function sanitizeTerminalText(value: string): string {
  return value;
}

/** Local theme stubs mirroring ./list.format.ts to keep formatting consistent. */
const theme = {
  heading: (s: string) => s,
  accent: (s: string) => s,
  accentBright: (s: string) => s,
  accentDim: (s: string) => s,
  success: (s: string) => s,
  error: (s: string) => s,
  warn: (s: string) => s,
  muted: (s: string) => s,
  info: (s: string) => s,
};

/** No-op colorize — returns the label unchanged when rich formatting is disabled. */
function colorize(rich: boolean, _paint: (s: string) => string, label: string): string {
  return rich ? _paint(label) : label;
}

/** Formats token counts as compact K-suffixed labels. */
function formatTokenK(value?: number | null): string {
  if (!value || !Number.isFinite(value)) {
    return "-";
  }
  if (value < 1024) {
    return `${Math.round(value)}`;
  }
  return `${Math.round(value / 1024)}k`;
}

/** Writes a JSON payload to the runtime log stream. */
function writeRuntimeJson(runtime: RuntimeEnv, payload: unknown): void {
  runtime.log(JSON.stringify(payload, null, 2));
}

const MODEL_PAD = 42;
const INPUT_PAD = 10;
const CTX_PAD = 11;
const LOCAL_PAD = 5;
const AUTH_PAD = 5;

function formatContextLabel(row: ModelRow): string {
  if (
    typeof row.contextTokens === "number" &&
    Number.isFinite(row.contextTokens) &&
    row.contextTokens > 0 &&
    row.contextTokens !== row.contextWindow
  ) {
    return `${formatTokenK(row.contextTokens)}/${formatTokenK(row.contextWindow)}`;
  }
  return formatTokenK(row.contextWindow);
}

/** Prints model-list rows in JSON, plain, or fixed-width terminal form. */
export function printModelTable(
  rows: ModelRow[],
  runtime: RuntimeEnv,
  opts: { json?: boolean; plain?: boolean } = {},
): void {
  if (opts.json) {
    writeRuntimeJson(runtime, {
      count: rows.length,
      models: rows,
    });
    return;
  }

  if (opts.plain) {
    for (const row of rows) {
      runtime.log(sanitizeTerminalText(row.key));
    }
    return;
  }

  const rich = isRich(opts);
  const header = [
    pad("Model", MODEL_PAD),
    pad("Input", INPUT_PAD),
    pad("Ctx", CTX_PAD),
    pad("Local", LOCAL_PAD),
    pad("Auth", AUTH_PAD),
    "Tags",
  ].join(" ");
  runtime.log(rich ? theme.heading(header) : header);

  for (const row of rows) {
    const keyLabel = pad(truncate(sanitizeTerminalText(row.key), MODEL_PAD), MODEL_PAD);
    const inputLabel = pad(sanitizeTerminalText(row.input) || "-", INPUT_PAD);
    const ctxLabel = pad(formatContextLabel(row), CTX_PAD);
    const localText = row.local === null ? "-" : row.local ? "yes" : "no";
    const localLabel = pad(localText, LOCAL_PAD);
    const authText = row.available === null ? "-" : row.available ? "yes" : "no";
    const authLabel = pad(authText, AUTH_PAD);
    const tags = row.tags.map(sanitizeTerminalText);
    const tagsLabel =
      tags.length > 0
        ? rich
          ? tags.map((tag) => formatTag(tag, rich)).join(",")
          : tags.join(",")
        : "";

    const coloredInput = colorize(
      rich,
      row.input.includes("image") ? theme.accentBright : theme.info,
      inputLabel,
    );
    const coloredLocal = colorize(
      rich,
      row.local === null ? theme.muted : row.local ? theme.success : theme.muted,
      localLabel,
    );
    const coloredAuth = colorize(
      rich,
      row.available === null ? theme.muted : row.available ? theme.success : theme.error,
      authLabel,
    );

    const line = [
      rich ? theme.accent(keyLabel) : keyLabel,
      coloredInput,
      ctxLabel,
      coloredLocal,
      coloredAuth,
      tagsLabel,
    ].join(" ");
    runtime.log(line);
  }
}
