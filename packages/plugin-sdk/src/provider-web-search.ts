// Public web-search registration helpers for provider plugins.

/** Web search provider plugin contract. */
export type WebSearchProviderPlugin = {
  id: string;
  [key: string]: unknown;
};

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
