/** Provider wizard. 移植自 openclaw/src/plugins/provider-wizard.ts。
 * 降级策略：返回空/undefined。 */
export type ProviderWizardOption = {
  id: string;
  label: string;
  description?: string;
};
export type ProviderModelPickerEntry = {
  modelId: string;
  label?: string;
  providerId?: string;
};
export function setProviderWizardProvidersResolverForTest(_resolver: unknown): void {
  // 降级
}
export function buildProviderPluginMethodChoice(providerId: string, methodId: string): string {
  return `${providerId}:${methodId}`;
}
export function resolveProviderWizardOptions(params: unknown): ProviderWizardOption[] {
  void params;
  return [];
}
export function resolveProviderModelPickerEntries(params: unknown): ProviderModelPickerEntry[] {
  void params;
  return [];
}
export function resolveProviderPluginChoice(params: unknown): string | undefined {
  void params;
  return undefined;
}
export async function runProviderModelSelectedHook(params: unknown): Promise<unknown> {
  void params;
  return undefined;
}
