/**
 * * Registry state for plugin memory runtimes, prompt supplements, and flush planning.
 * 移植自 openclaw/src/plugins/memory-state.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type MemoryPromptSectionBuilder = unknown;

export type MemoryCorpusSearchResult = unknown;

export type MemoryCorpusGetResult = unknown;

export type MemoryCorpusSupplement = unknown;

export type MemoryCorpusSupplementRegistration = unknown;

export type MemoryPromptSupplementRegistration = unknown;

export type MemoryFlushPlan = unknown;

export type MemoryFlushPlanResolver = unknown;

export type RegisteredMemorySearchManager = unknown;

export type MemoryRuntimeQmdConfig = unknown;

export type MemoryRuntimeBackendConfig = unknown;

export type MemoryPluginRuntime = unknown;

export type MemoryPluginPublicArtifactContentType = unknown;

export type MemoryPluginPublicArtifact = unknown;

export type MemoryPluginPublicArtifactsProvider = unknown;

export type MemoryPluginCapability = unknown;

export type MemoryPluginCapabilityRegistration = unknown;

export function registerMemoryCorpusSupplement(...args: unknown[]): unknown {
  throw new Error("not implemented: registerMemoryCorpusSupplement");
}

export function registerMemoryCapability(...args: unknown[]): unknown {
  throw new Error("not implemented: registerMemoryCapability");
}

export function getMemoryCapabilityRegistration(...args: unknown[]): unknown {
  throw new Error("not implemented: getMemoryCapabilityRegistration");
}

export function listMemoryCorpusSupplements(...args: unknown[]): unknown {
  throw new Error("not implemented: listMemoryCorpusSupplements");
}

export function registerMemoryPromptSection(...args: unknown[]): unknown {
  throw new Error("not implemented: registerMemoryPromptSection");
}

export function registerMemoryPromptSectionForPlugin(...args: unknown[]): unknown {
  throw new Error("not implemented: registerMemoryPromptSectionForPlugin");
}

export function registerMemoryPromptSupplement(...args: unknown[]): unknown {
  throw new Error("not implemented: registerMemoryPromptSupplement");
}

export function buildMemoryPromptSection(...args: unknown[]): unknown {
  throw new Error("not implemented: buildMemoryPromptSection");
}

export function listMemoryPromptSupplements(...args: unknown[]): unknown {
  throw new Error("not implemented: listMemoryPromptSupplements");
}

export function registerMemoryFlushPlanResolver(...args: unknown[]): unknown {
  throw new Error("not implemented: registerMemoryFlushPlanResolver");
}

export function registerMemoryFlushPlanResolverForPlugin(...args: unknown[]): unknown {
  throw new Error("not implemented: registerMemoryFlushPlanResolverForPlugin");
}

export function resolveMemoryFlushPlan(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveMemoryFlushPlan");
}

export function registerMemoryRuntime(...args: unknown[]): unknown {
  throw new Error("not implemented: registerMemoryRuntime");
}

