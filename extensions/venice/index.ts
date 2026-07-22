import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'venice',
  name: 'Venice Provider',
  description: 'Venice AI private LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class VeniceProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Venice provider extension');

    const apiKey = context.secrets('VENICE_API_KEY');
    if (!apiKey) {
      context.logger.warn('VENICE_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.venice.ai/api/v1',
      models: [
        { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', maxTokens: 131072 },
        { id: 'deepseek-r1-llama-70b', name: 'DeepSeek R1 70B', maxTokens: 131072, reasoning: true },
      ],
    };

    context.logger.info('Venice provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Venice provider extension');
  }
}
