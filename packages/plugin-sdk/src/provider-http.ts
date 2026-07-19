// Shared provider-facing HTTP helpers. Keep generic transport utilities here so
// capability SDKs do not depend on each other.

// export {
//   assertOkOrThrowHttpError,
//   assertOkOrThrowProviderError,
//   assertProviderBinaryResponseContent,
//   createProviderHttpError,
//   extractProviderErrorDetail,
//   extractProviderRequestId,
//   formatProviderErrorPayload,
//   formatProviderHttpErrorMessage,
//   readProviderBinaryResponse,
//   readProviderJsonArrayFieldResponse,
//   readProviderJsonObjectResponse,
//   readProviderJsonResponse,
//   readResponseTextLimited,
//   truncateErrorDetail,
// } from "../agents/provider-http-errors.js"; // TODO: 依赖模块未移植
// export {
//   buildAudioTranscriptionFormData,
//   createProviderOperationDeadline,
//   createProviderOperationTimeoutResolver,
//   fetchProviderDownloadResponse,
//   fetchProviderOperationResponse,
//   fetchWithTimeout,
//   fetchWithTimeoutGuarded,
//   normalizeBaseUrl,
//   pollProviderOperationJson,
//   postJsonRequest,
//   postMultipartRequest,
//   postTranscriptionRequest,
//   resolveProviderOperationTimeoutMs,
//   resolveProviderHttpRequestConfig,
//   resolveAudioTranscriptionUploadFileName,
//   requireTranscriptionText,
//   sanitizeConfiguredModelProviderRequest,
//   waitProviderOperationPollInterval,
// } from "../media-understanding/shared.js"; // TODO: 依赖模块未移植
// export type {
//   ProviderOperationDeadline,
//   ProviderOperationTimeoutMs,
// } from "../media-understanding/shared.js"; // TODO: 依赖模块未移植
// export {
//   executeProviderOperationWithRetry,
//   providerOperationRetryConfig,
// } from "../provider-runtime/operation-retry.js"; // TODO: 依赖模块未移植
// export type {
//   ProviderOperationRetryStage,
//   TransientProviderRetryConfig,
//   TransientProviderRetryOptions,
//   TransientProviderRetryParams,
// } from "../provider-runtime/operation-retry.js"; // TODO: 依赖模块未移植
// export type {
//   ProviderAttributionPolicy,
//   ProviderRequestCapabilities,
//   ProviderRequestCapabilitiesInput,
//   ProviderRequestCompatibilityFamily,
//   ProviderEndpointClass,
//   ProviderEndpointResolution,
//   ProviderRequestCapability,
//   ProviderRequestPolicyInput,
//   ProviderRequestPolicyResolution,
//   ProviderRequestTransport,
// } from "../agents/provider-attribution.js"; // TODO: 依赖模块未移植
// export type {
//   ProviderRequestAuthOverride,
//   ProviderRequestProxyOverride,
//   ProviderRequestTlsOverride,
//   ProviderRequestTransportOverrides,
// } from "../agents/provider-request-config.js"; // TODO: 依赖模块未移植
// export { resolveProviderRequestHeaders } from "../agents/provider-request-config.js"; // TODO: 依赖模块未移植
// export {
//   resolveProviderEndpoint,
//   resolveProviderRequestCapabilities,
//   resolveProviderRequestPolicy,
// } from "../agents/provider-attribution.js"; // TODO: 依赖模块未移植
