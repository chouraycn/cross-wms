// Media utility adapters for node CLI commands and temporary media outputs.
// 移植自 openclaw/src/cli/nodes-media-utils.ts。
//
// 降级策略：
//  - 原模块依赖 `../infra/tmp-openclaw-dir.js` 的 `resolvePreferredOpenClawTmpDir`，
//    cross-wms 未移植；改用 `node:os.tmpdir()` 降级。
//  - 原模块依赖 `../../packages/normalization-core/src/number-coercion.js` 的
//    `asFiniteNumber`、`string-coerce.js` 的 `readStringValue`、
//    `record-coerce.js` 的 `asRecord`、`../utils/boolean.js` 的 `asBoolean`。
//    这些模块在 cross-wms 中尚未完整移植；这里内联降级实现。
//  - 函数签名与导出保持与原模块一致，便于未来替换为正式实现。

import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import fs from "node:fs";
import path from "node:path";

// ===== 内联降级：resolvePreferredOpenClawTmpDir =====
function resolvePreferredOpenClawTmpDir(): string {
  const fromEnv = process.env.OPENCLAW_TMP_DIR?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return path.join(tmpdir(), "openclaw");
}
// ===== resolvePreferredOpenClawTmpDir 结束 =====

// ===== 内联降级：asFiniteNumber / asNumber =====
/** Coerce an unknown value to a finite number, returning undefined when not finite. */
export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}
// ===== asNumber 结束 =====

// ===== 内联降级：asString / readStringValue =====
/** Coerce an unknown value to a trimmed string, returning undefined when not a string. */
export function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
// ===== asString 结束 =====

// ===== 内联降级：asRecord =====
/** Coerce an unknown value to a Record<string, unknown>, returning {} otherwise. */
export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
// ===== asRecord 结束 =====

// ===== 内联降级：asBoolean =====
/** Coerce an unknown value to a boolean, returning undefined when not a boolean. */
export function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  return undefined;
}
// ===== asBoolean 结束 =====

/** Resolve temp path parts (tmpDir, id, ext) with restricted extension validation. */
export function resolveTempPathParts(opts: { ext: string; tmpDir?: string; id?: string }): {
  ext: string;
  tmpDir: string;
  id: string;
} {
  // Restrict extensions before writing temp media paths derived from CLI/user input.
  const tmpDir = opts.tmpDir ?? resolvePreferredOpenClawTmpDir();
  const rawExt = opts.ext.startsWith(".") ? opts.ext : `.${opts.ext}`;
  if (!/^\.[A-Za-z0-9][A-Za-z0-9_-]{0,15}$/u.test(rawExt)) {
    throw new Error("invalid media format");
  }
  if (!opts.tmpDir) {
    fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
  }
  return {
    tmpDir,
    id: opts.id ?? randomUUID(),
    ext: rawExt,
  };
}
