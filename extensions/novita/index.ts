import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'novita',
  name: 'Novita Provider',
  description: 'Novita AI serverless LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class NovitaProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Novita provider extension');

    const apiKey = context.secrets('NOVITA_API_KEY');
    if (!apiKey) {
      context.logger.warn('NOVITA_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.novita.ai/v3/openai',
      models: [
        { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', maxTokens: 64000, reasoning: true },
        { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', maxTokens: 131072 },
      ],
    };

    context.logger.info('Novita provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Novita provider extension');
  }
}
