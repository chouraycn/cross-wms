import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'gradium',
  name: 'Gradium Provider',
  description: 'Gradium AI LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class GradiumProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Gradium provider extension');

    const apiKey = context.secrets('GRADIUM_API_KEY');
    if (!apiKey) {
      context.logger.warn('GRADIUM_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.gradium.ai/v1',
      models: [
        { id: 'gradium-chat', name: 'Gradium Chat', maxTokens: 131072 },
      ],
    };

    context.logger.info('Gradium provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Gradium provider extension');
  }
}
