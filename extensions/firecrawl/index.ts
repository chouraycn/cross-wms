import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'firecrawl',
  name: 'Firecrawl Web Search',
  description: 'Firecrawl web crawl and search provider extension',
  version: '1.0.0',
  kind: 'web-search',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class FirecrawlWebSearch implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Firecrawl web search extension');

    const apiKey = context.secrets('FIRECRAWL_API_KEY');
    if (!apiKey) {
      context.logger.warn('FIRECRAWL_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: (context.config['baseUrl'] as string) || 'https://api.firecrawl.dev/v1',
      provider: 'firecrawl',
    };

    context.logger.info('Firecrawl web search registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Firecrawl web search extension');
  }
}
