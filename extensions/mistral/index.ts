import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'mistral',
  name: 'Mistral Provider',
  description: 'Mistral AI LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class MistralProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Mistral provider extension');

    const apiKey = context.secrets('MISTRAL_API_KEY');
    if (!apiKey) {
      context.logger.warn('MISTRAL_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.mistral.ai/v1',
      models: [
        { id: 'mistral-large-latest', name: 'Mistral Large', maxTokens: 128000 },
        { id: 'mistral-small-latest', name: 'Mistral Small', maxTokens: 32000 },
        { id: 'codestral-latest', name: 'Codestral', maxTokens: 256000 },
      ],
    };

    context.logger.info('Mistral provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Mistral provider extension');
  }
}
