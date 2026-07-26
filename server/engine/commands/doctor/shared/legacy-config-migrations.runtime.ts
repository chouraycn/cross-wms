// Aggregated runtime legacy config migration specs across diagnostics, mcp, providers, session, and tts.
// 移植自 openclaw/src/commands/doctor/shared/legacy-config-migrations.runtime.ts
//
// 降级说明：
//  - LegacyConfigMigrationSpec 来自 ../../../config/legacy.shared.js → cross-wms 占位为 unknown，
//    在本文件内提供本地等价类型，与各子模块导出的 LegacyConfigMigrationSpec 结构兼容
//  - 跳过未移植子模块：agents（依赖 @openclaw/model-catalog-core 与 agents/tool-policy*）、
//    gateway（依赖 config/gateway-control-ui-origins 与 DEFAULT_GATEWAY_PORT 未导出）、
//    models（依赖 @openclaw/model-catalog-core 与 agents/model-ref-profile）
import { LEGACY_CONFIG_MIGRATIONS_RUNTIME_DIAGNOSTICS } from "./legacy-config-migrations.runtime.diagnostics.js";
import { LEGACY_CONFIG_MIGRATIONS_RUNTIME_MCP } from "./legacy-config-migrations.runtime.mcp.js";
import { LEGACY_CONFIG_MIGRATIONS_RUNTIME_PROVIDERS } from "./legacy-config-migrations.runtime.providers.js";
import { LEGACY_CONFIG_MIGRATIONS_RUNTIME_SESSION } from "./legacy-config-migrations.runtime.session.js";
import { LEGACY_CONFIG_MIGRATIONS_RUNTIME_TTS } from "./legacy-config-migrations.runtime.tts.js";

type JsonRecord = Record<string, unknown>;

export type LegacyConfigRule = {
  path: string[];
  message: string;
  match?: (value: unknown, root: JsonRecord) => boolean;
  requireSourceLiteral?: boolean;
};

export type LegacyConfigMigration = {
  id: string;
  describe: string;
  apply: (raw: JsonRecord, changes: string[]) => void;
};

export type LegacyConfigMigrationSpec = LegacyConfigMigration & {
  legacyRules?: LegacyConfigRule[];
};

/**
 * Ordered runtime legacy config migrations applied by doctor.
 *
 * 注：相比 openclaw 原始版本，本聚合器仅包含已移植的 diagnostics/mcp/providers/session/tts。
 * agents/gateway/models 子模块因依赖未移植的 @openclaw/* 包或 agents/* 模块而暂未移植；
 * 待相应依赖补齐后可在此处追加。
 */
export const LEGACY_CONFIG_MIGRATIONS_RUNTIME: LegacyConfigMigrationSpec[] = [
  ...LEGACY_CONFIG_MIGRATIONS_RUNTIME_DIAGNOSTICS,
  ...LEGACY_CONFIG_MIGRATIONS_RUNTIME_MCP,
  ...LEGACY_CONFIG_MIGRATIONS_RUNTIME_PROVIDERS,
  ...LEGACY_CONFIG_MIGRATIONS_RUNTIME_SESSION,
  ...LEGACY_CONFIG_MIGRATIONS_RUNTIME_TTS,
];
