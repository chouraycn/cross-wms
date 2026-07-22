import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'cohere',
  name: 'Cohere Provider',
  description: 'Cohere Command R LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class CohereProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Cohere provider extension');

    const apiKey = context.secrets('COHERE_API_KEY');
    if (!apiKey) {
      context.logger.warn('COHERE_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.cohere.ai/v1',
      models: [
        { id: 'command-r-plus', name: 'Command R+', maxTokens: 128000 },
        { id: 'command-r', name: 'Command R', maxTokens: 128000 },
        { id: 'command-r7b', name: 'Command R7B', maxTokens: 128000 },
      ],
    };

    context.logger.info('Cohere provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Cohere provider extension');
  }
}
