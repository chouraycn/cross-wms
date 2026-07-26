// Cloudflare provider metadata describes Cloudflare-hosted model capabilities.
// Local type placeholder: openclaw Model has baseUrl/provider fields not on cross-wms Model.
/** Minimal model shape required by Cloudflare helpers. */
type CloudflareModel = {
  baseUrl: string;
  provider: string;
};

export function isCloudflareProvider(provider: string): boolean {
  return provider === "cloudflare-workers-ai" || provider === "cloudflare-ai-gateway";
}

/** Substitute `{VAR}` placeholders in a Cloudflare baseUrl from process.env. */
export function resolveCloudflareBaseUrl(model: CloudflareModel): string {
  const url = model.baseUrl;
  if (!url.includes("{")) {
    return url;
  }
  const baseUrl = url.replace(/\{([A-Z_][A-Z0-9_]*)\}/g, (_match, name: string) => {
    const value = process.env[name];
    if (!value) {
      throw new Error(`${name} is required for provider ${model.provider} but is not set.`);
    }
    return value;
  });
  return baseUrl;
}
