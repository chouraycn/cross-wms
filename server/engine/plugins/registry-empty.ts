// Provides the empty plugin registry used before discovery completes.
//
// 移植自 openclaw/src/plugins/registry-empty.ts。
//
// 降级策略：仅依赖 ./registry-types.js 的 PluginRegistry 类型。cross-wms 已
// 在本批移植中创建降级版 registry-types.ts，直接引用。行为与 openclaw 原版
// 一致：返回所有字段为空数组/空对象的 PluginRegistry。

import type { PluginRegistry } from "./registry-types.js";

export function createEmptyPluginRegistry(): PluginRegistry {
  return {
    plugins: [],
    tools: [],
    hooks: [],
    typedHooks: [],
    channels: [],
    channelSetups: [],
    providers: [],
    modelCatalogProviders: [],
    cliBackends: [],
    textTransforms: [],
    embeddingProviders: [],
    speechProviders: [],
    realtimeTranscriptionProviders: [],
    realtimeVoiceProviders: [],
    mediaUnderstandingProviders: [],
    transcriptSourceProviders: [],
    imageGenerationProviders: [],
    videoGenerationProviders: [],
    musicGenerationProviders: [],
    webFetchProviders: [],
    webSearchProviders: [],
    migrationProviders: [],
    codexAppServerExtensionFactories: [],
    agentToolResultMiddlewares: [],
    memoryEmbeddingProviders: [],
    agentHarnesses: [],
    gatewayHandlers: {},
    gatewayMethodDescriptors: [],
    coreGatewayMethodNames: [],
    httpRoutes: [],
    hostedMediaResolvers: [],
    cliRegistrars: [],
    reloads: [],
    nodeHostCommands: [],
    nodeInvokePolicies: [],
    securityAuditCollectors: [],
    services: [],
    gatewayDiscoveryServices: [],
    commands: [],
    sessionExtensions: [],
    trustedToolPolicies: [],
    toolMetadata: [],
    controlUiDescriptors: [],
    runtimeLifecycles: [],
    agentEventSubscriptions: [],
    sessionSchedulerJobs: [],
    sessionActions: [],
    conversationBindingResolvedHandlers: [],
    diagnostics: [],
  };
}
