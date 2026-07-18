// 移植自 openclaw/src/config/io.meta.ts
// 维护随用户配置一起写入的配置元数据字段。
//
// 降级说明：源文件依赖 ../version.js 的 VERSION 常量。cross-wms 的
// version.ts 未导出该常量（仅导出版本解析助手），此处使用静态占位版本。
import type { OpenClawConfig } from './types/openclaw.js';

/** 降级说明：未知运行时版本时使用占位版本号。 */
const VERSION = '0.0.0-unknown';

/** 自动写入的元数据键。 */
const AUTO_MANAGED_CONFIG_META_FIELDS = {
  lastTouchedVersion: 'lastTouchedVersion',
  lastTouchedAt: 'lastTouchedAt',
} as const;

export const AUTO_MANAGED_CONFIG_META_PATHS = [
  ['meta', AUTO_MANAGED_CONFIG_META_FIELDS.lastTouchedVersion],
  ['meta', AUTO_MANAGED_CONFIG_META_FIELDS.lastTouchedAt],
] as const;

export function stampConfigWriteMetadata(
  cfg: OpenClawConfig,
  now: string = new Date().toISOString(),
  version: string = VERSION,
): OpenClawConfig {
  return {
    ...cfg,
    meta: {
      ...cfg.meta,
      [AUTO_MANAGED_CONFIG_META_FIELDS.lastTouchedVersion]: version,
      [AUTO_MANAGED_CONFIG_META_FIELDS.lastTouchedAt]: now,
    },
  };
}
