import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'fireworks',
  name: 'Fireworks Provider',
  description: 'Fireworks AI high-throughput LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class FireworksProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Fireworks provider extension');

    const apiKey = context.secrets('FIREWORKS_API_KEY');
    if (!apiKey) {
      context.logger.warn('FIREWORKS_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.fireworks.ai/inference/v1',
      models: [
        { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', name: 'Llama 3.3 70B', maxTokens: 131072 },
        { id: 'accounts/fireworks/models/qwen2p5-72b-instruct', name: 'Qwen 2.5 72B', maxTokens: 32768 },
      ],
    };

    context.logger.info('Fireworks provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Fireworks provider extension');
  }
}
