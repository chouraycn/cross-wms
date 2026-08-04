// Narrow network/runtime facade re-exported for memory remote HTTP helpers.

export { fetchWithSsrFGuard } from "../../../../engine/infra/net/fetch-guard.js";
export { shouldUseEnvHttpProxyForUrl } from "../../../../engine/infra/net/proxy-env.js";
export { ssrfPolicyFromHttpBaseUrlAllowedHostname } from "../../../../engine/infra/net/ssrf.js";
