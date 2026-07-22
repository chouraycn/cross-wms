import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'together',
  name: 'Together Provider',
  description: 'Together AI serverless LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class TogetherProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Together provider extension');

    const apiKey = context.secrets('TOGETHER_API_KEY');
    if (!apiKey) {
      context.logger.warn('TOGETHER_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.together.xyz/v1',
      models: [
        { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', maxTokens: 131072 },
        { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B Turbo', maxTokens: 32768 },
      ],
    };

    context.logger.info('Together provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Together provider extension');
  }
}
