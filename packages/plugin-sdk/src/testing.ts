/**
 * @deprecated Broad compatibility barrel for older plugin tests.
 *
 * New tests should import focused `openclaw/plugin-sdk/*` test subpaths such as
 * `plugin-test-runtime`, `channel-test-helpers`, `test-env`, or `test-fixtures`.
 */

// export {
//   createAckReactionHandle,
//   removeAckReactionAfterReply,
//   removeAckReactionHandleAfterReply,
//   shouldAckReaction,
// } from "../channels/ack-reactions.js"; // TODO: 依赖模块未移植
// export {
//   expectChannelInboundContextContract,
//   expectChannelTurnDispatchResultContract,
//   primeChannelOutboundSendMock,
// } from "../channels/plugins/contracts/test-helpers.js"; // TODO: 依赖模块未移植
// export {
//   installChannelOutboundPayloadContractSuite,
//   type OutboundPayloadHarnessParams,
// } from "../channels/plugins/contracts/outbound-payload-testkit.js"; // TODO: 依赖模块未移植
// export { buildDispatchInboundCaptureMock } from "../channels/plugins/contracts/inbound-testkit.js"; // TODO: 依赖模块未移植
// export {
//   createCliRuntimeCapture,
//   firstWrittenJsonArg,
//   spyRuntimeErrors,
//   spyRuntimeJson,
//   spyRuntimeLogs,
// } from "../cli/test-runtime-capture.js"; // TODO: 依赖模块未移植
// export type { CliMockOutputRuntime, CliRuntimeCapture } from "../cli/test-runtime-capture.js"; // TODO: 依赖模块未移植
// export { setDefaultChannelPluginRegistryForTests } from "../commands/channel-test-registry.js"; // TODO: 依赖模块未移植
// export type { ChannelAccountSnapshot } from "../channels/plugins/types.public.js"; // TODO: 依赖模块未移植
// export type { ChannelGatewayContext } from "../channels/plugins/types.adapters.js"; // TODO: 依赖模块未移植
// export type { OpenClawConfig } from "../config/config.js"; // TODO: 依赖模块未移植
// export { isAtLeast, parseSemver } from "../infra/runtime-guard.js"; // TODO: 依赖模块未移植
// export { callGateway } from "../gateway/call.js"; // TODO: 依赖模块未移植
// /** @deprecated Direct outbound delivery is runtime substrate; use channel message runtime helpers. */
// export { deliverOutboundPayloads } from "../infra/outbound/deliver.js"; // TODO: 依赖模块未移植
// export {
//   createEmptyPluginRegistry,
//   createPluginRegistry,
//   type PluginRecord,
// } from "../plugins/registry.js"; // TODO: 依赖模块未移植
// export {
//   providerContractLoadError,
//   pluginRegistrationContractRegistry,
//   resolveProviderContractProvidersForPluginIds,
//   resolveWebFetchProviderContractEntriesForPluginId,
//   resolveWebSearchProviderContractEntriesForPluginId,
// } from "../plugins/contracts/registry.js"; // TODO: 依赖模块未移植
// export { loadPluginManifestRegistry } from "../plugins/manifest-registry.js"; // TODO: 依赖模块未移植
// export { parseMinHostVersionRequirement } from "../plugins/min-host-version.js"; // TODO: 依赖模块未移植
// export { resolveBundledExplicitProviderContractsFromPublicArtifacts } from "../plugins/provider-contract-public-artifacts.js"; // TODO: 依赖模块未移植
// export {
//   expectAugmentedCodexCatalog,
//   expectedAugmentedOpenaiCodexCatalogEntriesWithGpt55,
//   expectedOpenaiPluginCodexCatalogEntriesWithGpt55,
//   expectCodexMissingAuthHint,
// } from "../plugins/provider-runtime.test-support.js"; // TODO: 依赖模块未移植
// export {
//   initializeGlobalHookRunner,
//   resetGlobalHookRunner,
// } from "../plugins/hook-runner-global.js"; // TODO: 依赖模块未移植
// export { addTestHook } from "../plugins/hooks.test-helpers.js"; // TODO: 依赖模块未移植
// export {
//   assertUniqueValues,
//   BUNDLED_RUNTIME_SIDECAR_PATHS,
// } from "../plugins/runtime-sidecar-paths.js"; // TODO: 依赖模块未移植
// export { createPluginRecord } from "../plugins/status.test-helpers.js"; // TODO: 依赖模块未移植
// export {
//   resolveBundledExplicitWebFetchProvidersFromPublicArtifacts,
//   resolveBundledExplicitWebSearchProvidersFromPublicArtifacts,
// } from "../plugins/web-provider-public-artifacts.explicit.js"; // TODO: 依赖模块未移植
// export {
//   getActivePluginRegistry,
//   releasePinnedPluginChannelRegistry,
//   resetPluginRuntimeStateForTest,
//   setActivePluginRegistry,
// } from "../plugins/runtime.js"; // TODO: 依赖模块未移植
// export {
//   listImportedBundledPluginFacadeIds,
//   resetFacadeRuntimeStateForTest,
// } from "./facade-runtime.js"; // TODO: 依赖模块未移植
// export { capturePluginRegistration } from "../plugins/captured-registration.js"; // TODO: 依赖模块未移植
// export { runProviderCatalog } from "../plugins/provider-discovery.js"; // TODO: 依赖模块未移植
// export {
//   buildProviderPluginMethodChoice,
//   resolveProviderModelPickerEntries,
//   resolveProviderWizardOptions,
//   setProviderWizardProvidersResolverForTest,
// } from "../plugins/provider-wizard.js"; // TODO: 依赖模块未移植
// export { resolveProviderPluginChoice } from "../plugins/provider-auth-choice.runtime.js"; // TODO: 依赖模块未移植
// export type { PluginRuntime } from "../plugins/runtime/types.js"; // TODO: 依赖模块未移植
// export type { PluginHookRegistration } from "../plugins/hook-types.js"; // TODO: 依赖模块未移植
// export type { RuntimeEnv } from "../runtime.js"; // TODO: 依赖模块未移植
// export type { MockFn } from "../test-utils/vitest-mock-fn.js"; // TODO: 依赖模块未移植
// export {
//   createAuthCaptureJsonFetch,
//   createRequestCaptureJsonFetch,
//   installPinnedHostnameTestHooks,
// } from "../media-understanding/audio.test-helpers.ts"; // TODO: 依赖模块未移植
// export {
//   createSingleUserPromptMessage,
//   extractNonEmptyAssistantText,
//   isLiveProfileKeyModeEnabled,
//   isLiveTestEnabled,
// } from "../agents/live-test-helpers.js"; // TODO: 依赖模块未移植
// export { createSandboxTestContext } from "../agents/sandbox/test-fixtures.js"; // TODO: 依赖模块未移植
// export { writeSkill } from "../skills/test-support/e2e-test-helpers.js"; // TODO: 依赖模块未移植
// export {
//   castAgentMessage,
//   makeAgentAssistantMessage,
//   makeAgentUserMessage,
// } from "../agents/test-helpers/agent-message-fixtures.js"; // TODO: 依赖模块未移植
// export { collectProviderApiKeys } from "../agents/live-auth-keys.js"; // TODO: 依赖模块未移植
// export { isModelNotFoundErrorMessage } from "../agents/live-model-errors.js"; // TODO: 依赖模块未移植
// export {
//   isAuthErrorMessage,
//   isBillingErrorMessage,
//   isOverloadedErrorMessage,
//   isServerErrorMessage,
//   isTimeoutErrorMessage,
// } from "../agents/embedded-agent-helpers/failover-matches.js"; // TODO: 依赖模块未移植
// export { maybeLoadShellEnvForGenerationProviders } from "../test-utils/generation-live-test-helpers.js"; // TODO: 依赖模块未移植
// export { testing, testing as __testing } from "../acp/control-plane/manager.js"; // TODO: 依赖模块未移植
// export { testing as acpManagerTesting } from "../acp/control-plane/manager.js"; // TODO: 依赖模块未移植
// export { runAcpRuntimeAdapterContract } from "../acp/runtime/adapter-contract.testkit.js"; // TODO: 依赖模块未移植
// export { handleAcpCommand } from "../auto-reply/reply/commands-acp.js"; // TODO: 依赖模块未移植
// export { buildCommandTestParams } from "../auto-reply/reply/commands-spawn.test-harness.js"; // TODO: 依赖模块未移植
// export { peekSystemEvents, resetSystemEventsForTest } from "../infra/system-events.js"; // TODO: 依赖模块未移植
// export { isTruthyEnvValue } from "../infra/env.js"; // TODO: 依赖模块未移植
// export { getShellEnvAppliedKeys } from "../infra/shell-env.js"; // TODO: 依赖模块未移植
// export { encodePngRgba, fillPixel } from "../media/png-encode.js"; // TODO: 依赖模块未移植
// export {
//   parseLiveCsvFilter as parseCsvFilter,
//   parseProviderModelMap,
//   redactLiveApiKey,
// } from "../media-generation/live-test-helpers.js"; // TODO: 依赖模块未移植
// export {
//   DEFAULT_LIVE_MUSIC_MODELS,
//   resolveConfiguredLiveMusicModels,
//   resolveLiveMusicAuthStore,
// } from "../music-generation/live-test-helpers.js"; // TODO: 依赖模块未移植
// export {
//   canRunBufferBackedImageToVideoLiveLane,
//   canRunBufferBackedVideoToVideoLiveLane,
//   DEFAULT_LIVE_VIDEO_MODELS,
//   resolveConfiguredLiveVideoModels,
//   resolveLiveVideoAuthStore,
//   resolveLiveVideoResolution,
// } from "../video-generation/live-test-helpers.js"; // TODO: 依赖模块未移植
// export { normalizeVideoGenerationDuration } from "../video-generation/duration-support.js"; // TODO: 依赖模块未移植
// export { parseVideoGenerationModelRef } from "../video-generation/model-ref.js"; // TODO: 依赖模块未移植
// export type {
//   GeneratedVideoAsset,
//   VideoGenerationMode,
//   VideoGenerationModeCapabilities,
//   VideoGenerationProvider,
//   VideoGenerationRequest,
// } from "../video-generation/types.js"; // TODO: 依赖模块未移植
// export { jsonResponse, requestBodyText, requestUrl } from "../test-helpers/http.js"; // TODO: 依赖模块未移植
// export { mockPinnedHostnameResolution } from "../test-helpers/ssrf.js"; // TODO: 依赖模块未移植
// export { createOutboundTestPlugin, createTestRegistry } from "../test-utils/channel-plugins.js"; // TODO: 依赖模块未移植
// export { createWindowsCmdShimFixture } from "../test-helpers/windows-cmd-shim.js"; // TODO: 依赖模块未移植
// export { installCommonResolveTargetErrorCases } from "../test-helpers/resolve-target-error-cases.js"; // TODO: 依赖模块未移植
// export { sanitizeTerminalText } from "../../packages/terminal-core/src/safe-text.js"; // TODO: 依赖模块未移植
// export { withStateDirEnv } from "../test-helpers/state-dir-env.js"; // TODO: 依赖模块未移植
// export { countLines, hasBalancedFences } from "../test-utils/chunk-test-helpers.js"; // TODO: 依赖模块未移植
// export { expectGeneratedTokenPersistedToGatewayAuth } from "../test-utils/auth-token-assertions.js"; // TODO: 依赖模块未移植
// export { captureEnv, withEnv, withEnvAsync } from "../test-utils/env.js"; // TODO: 依赖模块未移植
// export { withFetchPreconnect, type FetchMock } from "../test-utils/fetch-mock.js"; // TODO: 依赖模块未移植
// export { createMockServerResponse } from "../test-utils/mock-http-response.js"; // TODO: 依赖模块未移植
// export {
//   registerProviderPlugin,
//   registerProviderPlugins,
//   registerSingleProviderPlugin,
//   requireRegisteredProvider,
//   type RegisteredProviderCollections,
// } from "../test-utils/plugin-registration.js"; // TODO: 依赖模块未移植
// export { createTempHomeEnv, type TempHomeEnv } from "../test-utils/temp-home.js"; // TODO: 依赖模块未移植
// export { withTempDir } from "../test-utils/temp-dir.js"; // TODO: 依赖模块未移植
// export { typedCases } from "../test-utils/typed-cases.js"; // TODO: 依赖模块未移植
// export { createProviderUsageFetch, makeResponse } from "../test-utils/provider-usage-fetch.js"; // TODO: 依赖模块未移植
// export { useFrozenTime, useRealTime } from "../test-utils/frozen-time.js"; // TODO: 依赖模块未移植
// export {
//   createNonExitingRuntimeEnv,
//   createNonExitingTypedRuntimeEnv,
//   createRuntimeEnv,
//   createTypedRuntimeEnv,
// } from "../test-utils/plugin-runtime-env.js"; // TODO: 依赖模块未移植
// export {
//   createPluginSetupWizardAdapter,
//   createPluginSetupWizardConfigure,
//   createPluginSetupWizardStatus,
//   createQueuedWizardPrompter,
//   createSetupWizardAdapter,
//   createTestWizardPrompter,
//   promptSetupWizardAllowFrom,
//   resolveSetupWizardAllowFromEntries,
//   resolveSetupWizardGroupAllowlist,
//   runSetupWizardConfigure,
//   runSetupWizardFinalize,
//   runSetupWizardPrepare,
//   selectFirstWizardOption,
//   type WizardPrompter,
// } from "../test-utils/plugin-setup-wizard.js"; // TODO: 依赖模块未移植
// export { createMockPluginRegistry } from "../plugins/hooks.test-helpers.js"; // TODO: 依赖模块未移植
// export { buildPluginApi } from "../plugins/api-builder.js"; // TODO: 依赖模块未移植
// export {
//   createCapturedPluginRegistration,
//   type CapturedPluginRegistration,
// } from "../plugins/captured-registration.js"; // TODO: 依赖模块未移植
// export { createRuntimeTaskFlow } from "../plugins/runtime/runtime-taskflow.js"; // TODO: 依赖模块未移植
