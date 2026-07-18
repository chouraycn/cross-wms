/** Provider self-hosted setup. 移植自 openclaw/src/plugins/provider-self-hosted-setup.ts。
 * 降级策略：抛出 not implemented。 */
/** 占位：OpenClawConfig。 */
type OpenClawConfig = unknown;

export async function discoverOpenAICompatibleLocalModels(params: unknown): Promise<unknown[]> {
  void params;
  return [];
}
export function applyProviderDefaultModel(cfg: OpenClawConfig, modelRef: string): OpenClawConfig {
  void modelRef;
  return cfg;
}
export async function promptAndConfigureOpenAICompatibleSelfHostedProvider(params: unknown): Promise<unknown> {
  void params;
  throw new Error("not implemented: promptAndConfigureOpenAICompatibleSelfHostedProvider");
}
export async function promptAndConfigureOpenAICompatibleSelfHostedProviderAuth(params: unknown): Promise<unknown> {
  void params;
  throw new Error("not implemented: promptAndConfigureOpenAICompatibleSelfHostedProviderAuth");
}
export async function discoverOpenAICompatibleSelfHostedProvider<T>(params: unknown): Promise<T[]> {
  void params;
  return [];
}
export async function configureOpenAICompatibleSelfHostedProviderNonInteractive(params: unknown): Promise<unknown> {
  void params;
  throw new Error("not implemented: configureOpenAICompatibleSelfHostedProviderNonInteractive");
}
