/**
 * Provider runtime.
 * 移植自 openclaw/src/plugins/provider-runtime.ts。
 * 降级策略：运行时函数返回 undefined/抛出错误。
 */

export const testing = {
  resetCache(): void {
    // 降级
  },
};

export function runProviderDynamicModel(params: any): any {
  void params;
  return undefined;
}

export function resolveProviderSystemPromptContribution(params: any): any {
  void params;
  return undefined;
}

export function transformProviderSystemPrompt(params: any): string | undefined {
  void params;
  return undefined;
}

export function resolveProviderTextTransforms(params: any): any[] {
  void params;
  return [];
}

export async function prepareProviderDynamicModel(params: any): Promise<any> {
  void params;
  return undefined;
}

export function shouldPreferProviderRuntimeResolvedModel(params: any): boolean {
  void params;
  return false;
}

export function normalizeProviderResolvedModelWithPlugin(params: any): any {
  void params;
  return undefined;
}

export function applyProviderResolvedTransportWithPlugin(params: any): any {
  void params;
  return undefined;
}

export function normalizeProviderModelIdWithPlugin(params: any): string | undefined {
  void params;
  return undefined;
}

export function normalizeProviderTransportWithPlugin(params: any): any {
  void params;
  return undefined;
}

export function normalizeProviderConfigWithPlugin(params: any): any {
  void params;
  return undefined;
}

export function applyProviderNativeStreamingUsageCompatWithPlugin(params: any): any {
  void params;
  return undefined;
}

export function resolveProviderConfigApiKeyWithPlugin(params: any): string | undefined {
  void params;
  return undefined;
}

export function resolveProviderReplayPolicyWithPlugin(params: any): any {
  void params;
  return undefined;
}

export async function sanitizeProviderReplayHistoryWithPlugin(params: any): Promise<any> {
  void params;
  return undefined;
}

export async function validateProviderReplayTurnsWithPlugin(params: any): Promise<any> {
  void params;
  return undefined;
}

export function normalizeProviderToolSchemasWithPlugin(params: any): any {
  void params;
  return undefined;
}

export function inspectProviderToolSchemasWithPlugin(params: any): any {
  void params;
  return undefined;
}

export function resolveProviderCacheTtlEligibility(params: any): any {
  void params;
  return undefined;
}

export function prepareProviderRuntimeAuth(params: any): any {
  void params;
  return undefined;
}
