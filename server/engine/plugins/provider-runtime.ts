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

export function runProviderDynamicModel(params: unknown): unknown {
  void params;
  return undefined;
}

export function resolveProviderSystemPromptContribution(params: unknown): unknown {
  void params;
  return undefined;
}

export function transformProviderSystemPrompt(params: unknown): string | undefined {
  void params;
  return undefined;
}

export function resolveProviderTextTransforms(params: unknown): unknown[] {
  void params;
  return [];
}

export async function prepareProviderDynamicModel(params: unknown): Promise<unknown> {
  void params;
  return undefined;
}

export function shouldPreferProviderRuntimeResolvedModel(params: unknown): boolean {
  void params;
  return false;
}

export function normalizeProviderResolvedModelWithPlugin(params: unknown): unknown {
  void params;
  return undefined;
}

export function applyProviderResolvedTransportWithPlugin(params: unknown): unknown {
  void params;
  return undefined;
}

export function normalizeProviderModelIdWithPlugin(params: unknown): string | undefined {
  void params;
  return undefined;
}

export function normalizeProviderTransportWithPlugin(params: unknown): unknown {
  void params;
  return undefined;
}

export function normalizeProviderConfigWithPlugin(params: unknown): unknown {
  void params;
  return undefined;
}

export function applyProviderNativeStreamingUsageCompatWithPlugin(params: unknown): unknown {
  void params;
  return undefined;
}

export function resolveProviderConfigApiKeyWithPlugin(params: unknown): string | undefined {
  void params;
  return undefined;
}

export function resolveProviderReplayPolicyWithPlugin(params: unknown): unknown {
  void params;
  return undefined;
}

export async function sanitizeProviderReplayHistoryWithPlugin(params: unknown): Promise<unknown> {
  void params;
  return undefined;
}

export async function validateProviderReplayTurnsWithPlugin(params: unknown): Promise<unknown> {
  void params;
  return undefined;
}

export function normalizeProviderToolSchemasWithPlugin(params: unknown): unknown {
  void params;
  return undefined;
}

export function inspectProviderToolSchemasWithPlugin(params: unknown): unknown {
  void params;
  return undefined;
}
