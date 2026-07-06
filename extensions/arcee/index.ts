import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'arcee',
  name: 'Arcee Embedding Provider',
  description: 'Arcee embedding provider extension',
  version: '1.0.0',
  kind: 'embedding-provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class ArceeEmbeddingProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Arcee embedding provider extension');
    
    const apiKey = context.secrets('ARCEE_API_KEY');
    if (!apiKey) {
      context.logger.warn('ARCEE_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.arcee.ai',
      models: [
        { id: 'arcee-embed', name: 'Arcee Embed', dimension: 1024 },
      ],
    };

    context.logger.info('Arcee embedding provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Arcee embedding provider extension');
  }
}