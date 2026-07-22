import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'chutes',
  name: 'Chutes Provider',
  description: 'Chutes AI OpenAI-compatible inference provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class ChutesProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Chutes provider extension');

    const apiKey = context.secrets('CHUTES_API_KEY');
    if (!apiKey) {
      context.logger.warn('CHUTES_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.chutes.ai/v1',
      models: [
        { id: 'chutes-deepseek-v3', name: 'DeepSeek V3 (Chutes)', maxTokens: 64000 },
        { id: 'chutes-llama-3.3-70b', name: 'Llama 3.3 70B (Chutes)', maxTokens: 131072 },
      ],
    };

    context.logger.info('Chutes provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Chutes provider extension');
  }
}
