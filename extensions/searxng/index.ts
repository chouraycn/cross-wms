import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'searxng',
  name: 'SearXNG Web Search',
  description: 'SearXNG self-hosted meta search provider extension (no API key required)',
  version: '1.0.0',
  kind: 'web-search',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

export default class SearxngWebSearch implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering SearXNG web search extension');

    const config = {
      baseUrl: (context.config['baseUrl'] as string) || 'http://localhost:8080',
      provider: 'searxng',
    };

    context.logger.info('SearXNG web search registered with baseUrl:', config.baseUrl);
  }

  unregister(): void {
    console.log('Unregistering SearXNG web search extension');
  }
}
