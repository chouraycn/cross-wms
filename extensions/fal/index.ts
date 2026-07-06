import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'fal',
  name: 'Fal Provider',
  description: 'Fal AI provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class FalProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Fal provider extension');
    
    const apiKey = context.secrets('FAL_API_KEY');
    if (!apiKey) {
      context.logger.warn('FAL_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.fal.run/v1',
      models: [
        { id: 'fal-80b-chat', name: 'Fal 80B Chat', maxTokens: 32768 },
        { id: 'fal-llama-3.3-405b', name: 'Fal Llama 3.3 405B', maxTokens: 128000 },
      ],
    };

    context.logger.info('Fal provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Fal provider extension');
  }
}