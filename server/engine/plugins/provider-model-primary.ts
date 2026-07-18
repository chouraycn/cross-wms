/** Provider model primary. 移植自 openclaw/src/plugins/provider-model-primary.ts。
 * 降级策略：返回原 cfg。 */
/** 占位：OpenClawConfig。 */
type OpenClawConfig = unknown;
export function applyPrimaryModel(cfg: OpenClawConfig, model: string): OpenClawConfig {
  void model;
  return cfg;
}
