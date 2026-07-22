import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'voyage',
  name: 'Voyage Embedding Provider',
  description: 'Voyage AI embedding provider extension',
  version: '1.0.0',
  kind: 'embedding-provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class VoyageEmbeddingProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Voyage embedding provider extension');

    const apiKey = context.secrets('VOYAGE_API_KEY');
    if (!apiKey) {
      context.logger.warn('VOYAGE_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.voyageai.com/v1',
      models: [
        { id: 'voyage-3', name: 'Voyage 3', dimension: 1024 },
        { id: 'voyage-3-large', name: 'Voyage 3 Large', dimension: 1024 },
        { id: 'voyage-code-3', name: 'Voyage Code 3', dimension: 1024 },
      ],
    };

    context.logger.info('Voyage embedding provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Voyage embedding provider extension');
  }
}
