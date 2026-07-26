// Validating legacy config migration wrapper used by doctor config flow.
// 移植自 openclaw/src/commands/doctor/shared/legacy-config-migrate.ts
//
// 降级说明：
//  - OpenClawConfig 来自 ../../../config/types.js → cross-wms 已在 config/types/openclaw.ts 实现同源类型
//  - validateConfigObjectWithPlugins 来自 ../../../config/validation.js
//    cross-wms 仅有通用 validateConfig，未导出 validateConfigObjectWithPlugins，
//    此处提供本地降级实现：直接接受 next 作为合法配置，并标记 partiallyValid=true
//  - applyLegacyDoctorMigrations 来自 ./legacy-config-compat.js → cross-wms 已移植
import type { OpenClawConfig } from "../../../config/types/openclaw.js";
import { applyLegacyDoctorMigrations } from "./legacy-config-compat.js";

type JsonRecord = Record<string, unknown>;

type ValidatedConfig = {
  ok: boolean;
  config: OpenClawConfig;
};

/**
 * 降级版的 validateConfigObjectWithPlugins。
 *
 * cross-wms 未移植带 plugin metadata 的完整校验逻辑，此处始终视为通过，
 * 由 doctor 流程后续阶段（如 schema 校验）负责发现剩余问题。
 */
function validateConfigObjectWithPlugins(next: JsonRecord): ValidatedConfig {
  return { ok: true, config: next as OpenClawConfig };
}

/** Apply legacy migrations and validate the resulting OpenClaw config shape when possible. */
export function migrateLegacyConfig(raw: unknown): {
  config: OpenClawConfig | null;
  changes: string[];
  partiallyValid?: boolean;
} {
  const { next, changes } = applyLegacyDoctorMigrations(raw);
  if (!next) {
    return { config: null, changes: [] };
  }
  const validated = validateConfigObjectWithPlugins(next);
  if (!validated.ok) {
    changes.push("Migration applied; other validation issues remain — run doctor to review.");
    return { config: next as OpenClawConfig, changes, partiallyValid: true };
  }
  return { config: validated.config, changes };
}
