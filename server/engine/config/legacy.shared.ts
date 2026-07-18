// 移植自 openclaw/src/config/legacy.shared.ts
// 定义共享的遗留配置规则契约，用于检测和迁移。
//
// 降级说明：源文件依赖 ../utils.js 的 isRecord。cross-wms 的 utils 模块
// 未导出该函数，此处内联等价实现，与 io.observe-recovery.ts 等已移植
// 文件的降级策略保持一致。
import { isSafeExecutableValue } from '../infra/exec-safety.js';
import { isBlockedObjectKey } from '../infra/prototype-keys.js';

// 降级说明：内联 isRecord，等价于 openclaw 的 ../utils.js 导出。
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export type LegacyConfigRule = {
  path: string[];
  message: string;
  match?: (value: unknown, root: Record<string, unknown>) => boolean;
  // 若为 true，仅当原始解析源中存在该遗留值时才报告（而非仅在 include/env
  // 解析之后）。
  requireSourceLiteral?: boolean;
};

type LegacyConfigMigration = {
  id: string;
  describe: string;
  apply: (raw: Record<string, unknown>, changes: string[]) => void;
};

export type LegacyConfigMigrationSpec = LegacyConfigMigration & {
  legacyRules?: LegacyConfigRule[];
};

export const getRecord = (value: unknown): Record<string, unknown> | null =>
  isRecord(value) ? value : null;

export const ensureRecord = (
  root: Record<string, unknown>,
  key: string,
): Record<string, unknown> => {
  const existing = root[key];
  if (isRecord(existing)) {
    return existing;
  }
  const next: Record<string, unknown> = {};
  root[key] = next;
  return next;
};

export const mergeMissing = (target: Record<string, unknown>, source: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || isBlockedObjectKey(key)) {
      continue;
    }
    const existing = target[key];
    if (existing === undefined) {
      target[key] = value;
      continue;
    }
    if (isRecord(existing) && isRecord(value)) {
      mergeMissing(existing, value);
    }
  }
};

export const mapLegacyAudioTranscription = (value: unknown): Record<string, unknown> | null => {
  const transcriber = getRecord(value);
  const command = Array.isArray(transcriber?.command) ? transcriber?.command : null;
  if (!command || command.length === 0) {
    return null;
  }
  if (typeof command[0] !== 'string') {
    return null;
  }
  if (!command.every((part) => typeof part === 'string')) {
    return null;
  }
  const rawExecutable = command[0].trim();
  if (!rawExecutable) {
    return null;
  }
  if (!isSafeExecutableValue(rawExecutable)) {
    return null;
  }

  const args = command.slice(1).map((part) => part.replace(/\{input\}/g, '{{MediaPath}}'));
  const timeoutSeconds =
    typeof transcriber?.timeoutSeconds === 'number' ? transcriber?.timeoutSeconds : undefined;

  const result: Record<string, unknown> = { command: rawExecutable, type: 'cli' };
  if (args.length > 0) {
    result.args = args;
  }
  if (timeoutSeconds !== undefined) {
    result.timeoutSeconds = timeoutSeconds;
  }
  return result;
};

export const defineLegacyConfigMigration = (
  migration: LegacyConfigMigrationSpec,
): LegacyConfigMigrationSpec => migration;
