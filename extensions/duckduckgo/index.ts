import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'duckduckgo',
  name: 'DuckDuckGo Web Search',
  description: 'DuckDuckGo web search provider extension (no API key required)',
  version: '1.0.0',
  kind: 'web-search',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

export default class DuckDuckGoWebSearch implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering DuckDuckGo web search extension');

    const config = {
      baseUrl: 'https://html.duckduckgo.com/html',
      provider: 'duckduckgo',
    };

    context.logger.info('DuckDuckGo web search registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering DuckDuckGo web search extension');
  }
}
