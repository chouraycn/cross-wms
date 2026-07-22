import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'brave',
  name: 'Brave Web Search',
  description: 'Brave Search provider plugin for web search',
  version: '1.0.0',
  kind: 'web-search',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class BraveWebSearch implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Brave web search extension');

    const apiKey = context.secrets('BRAVE_API_KEY');
    if (!apiKey) {
      context.logger.warn('BRAVE_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: (context.config['baseUrl'] as string) || 'https://api.search.brave.com',
      mode: (context.config['mode'] as string) || 'web',
      provider: 'brave',
    };

    context.logger.info('Brave web search registered with mode:', config.mode);
  }

  unregister(): void {
    console.log('Unregistering Brave web search extension');
  }
}
