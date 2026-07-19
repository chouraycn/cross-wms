// @ts-nocheck
// Public web-search registration helpers for provider plugins.

// import type {
//   WebSearchCredentialResolutionSource,
//   WebSearchProviderSetupContext,
//   WebSearchProviderPlugin,
//   WebSearchProviderToolDefinition,
//   WebSearchProviderToolExecutionContext,
// } from "../plugins/types.js"; // TODO: 依赖模块未移植
// export {
//   jsonResult,
//   readNonNegativeIntegerParam,
//   readNumberParam,
//   readPositiveIntegerParam,
//   readStringArrayParam,
//   readStringParam,
// } from "../agents/tools/common.js"; // TODO: 依赖模块未移植
// export { resolveCitationRedirectUrl } from "../agents/tools/web-search-citation-redirect.js"; // TODO: 依赖模块未移植
// export {
//   buildSearchCacheKey,
//   buildUnsupportedSearchFilterResponse,
//   DEFAULT_SEARCH_COUNT,
//   FRESHNESS_TO_RECENCY,
//   isoToPerplexityDate,
//   MAX_SEARCH_COUNT,
//   normalizeFreshness,
//   normalizeToIsoDate,
//   parseIsoDateRange,
//   parseWebSearchTimeFilters,
//   readCachedSearchPayload,
//   readConfiguredSecretString,
//   readProviderEnvValue,
//   resolveSearchCacheTtlMs,
//   resolveSearchCount,
//   resolveSearchTimeoutSeconds,
//   resolveSiteName,
//   postTrustedWebToolsJson,
//   throwWebSearchApiError,
//   withSelfHostedWebSearchEndpoint,
//   withTrustedWebSearchEndpoint,
//   writeCachedSearchPayload,
// } from "../agents/tools/web-search-provider-common.js"; // TODO: 依赖模块未移植
// export {
//   getScopedCredentialValue,
//   getTopLevelCredentialValue,
//   mergeScopedSearchConfig,
//   resolveProviderWebSearchPluginConfig,
//   setScopedCredentialValue,
//   setProviderWebSearchPluginConfigValue,
//   setTopLevelCredentialValue,
// } from "../agents/tools/web-search-provider-config.js"; // TODO: 依赖模块未移植
// export type { SearchConfigRecord } from "../agents/tools/web-search-provider-common.js"; // TODO: 依赖模块未移植
// export { resolveWebSearchProviderCredential } from "../agents/tools/web-search-provider-credentials.js"; // TODO: 依赖模块未移植
// export {
//   withSelfHostedWebToolsEndpoint,
//   withTrustedWebToolsEndpoint,
// } from "../agents/tools/web-guarded-fetch.js"; // TODO: 依赖模块未移植
// export { markdownToText, truncateText } from "../agents/tools/web-fetch-utils.js"; // TODO: 依赖模块未移植
// export {
//   DEFAULT_CACHE_TTL_MINUTES,
//   DEFAULT_TIMEOUT_SECONDS,
//   normalizeCacheKey,
//   readCache,
//   readResponseText,
//   resolveCacheTtlMs,
//   resolvePositiveTimeoutSeconds,
//   resolveTimeoutSeconds,
//   writeCache,
// } from "../agents/tools/web-shared.js"; // TODO: 依赖模块未移植
// export { enablePluginInConfig } from "../plugins/enable.js"; // TODO: 依赖模块未移植
// export { formatCliCommand } from "../cli/command-format.js"; // TODO: 依赖模块未移植
// export { wrapWebContent } from "../security/external-content.js"; // TODO: 依赖模块未移植
// export type {
//   WebSearchCredentialResolutionSource,
//   WebSearchProviderSetupContext,
//   WebSearchProviderPlugin,
//   WebSearchProviderToolDefinition,
//   WebSearchProviderToolExecutionContext,
// }; // TODO: 依赖模块未移植

/**
 * @deprecated Implement provider-owned `createTool(...)` directly on the
 * returned WebSearchProviderPlugin instead of routing through core.
 */
export function createPluginBackedWebSearchProvider(
  provider: WebSearchProviderPlugin,
): WebSearchProviderPlugin {
  return {
    ...provider,
    createTool: () => {
      throw new Error(
        `createPluginBackedWebSearchProvider(${provider.id}) is no longer supported. ` +
          "Define provider-owned createTool(...) directly in the extension's WebSearchProviderPlugin.",
      );
    },
  };
}
