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
export function setProviderWizardProvidersResolverForTest(_resolver: any): void {
  // 降级
}
export function buildProviderPluginMethodChoice(providerId: string, methodId: string): string {
  return `${providerId}:${methodId}`;
}
export function resolveProviderWizardOptions(params: any): ProviderWizardOption[] {
  void params;
  return [];
}
export function resolveProviderModelPickerEntries(params: any): ProviderModelPickerEntry[] {
  void params;
  return [];
}
export function resolveProviderPluginChoice(params: any): string | undefined {
  void params;
  return undefined;
}
export async function runProviderModelSelectedHook(params: any): Promise<any> {
  void params;
  return undefined;
}
