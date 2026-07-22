import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'exa',
  name: 'Exa Web Search',
  description: 'Exa (Metaphor) neural web search provider extension',
  version: '1.0.0',
  kind: 'web-search',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class ExaWebSearch implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Exa web search extension');

    const apiKey = context.secrets('EXA_API_KEY');
    if (!apiKey) {
      context.logger.warn('EXA_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.exa.ai',
      provider: 'exa',
    };

    context.logger.info('Exa web search registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Exa web search extension');
  }
}
