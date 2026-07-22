import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'gmi',
  name: 'GMI Provider',
  description: 'GMI Inference LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class GmiProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering GMI provider extension');

    const apiKey = context.secrets('GMI_API_KEY');
    if (!apiKey) {
      context.logger.warn('GMI_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.gmi-serving.com/v1',
      models: [
        { id: 'gmi-chat', name: 'GMI Chat', maxTokens: 131072 },
      ],
    };

    context.logger.info('GMI provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering GMI provider extension');
  }
}
