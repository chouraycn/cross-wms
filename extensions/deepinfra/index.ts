import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'deepinfra',
  name: 'DeepInfra Provider',
  description: 'DeepInfra serverless inference LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class DeepInfraProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering DeepInfra provider extension');

    const apiKey = context.secrets('DEEPINFRA_API_KEY');
    if (!apiKey) {
      context.logger.warn('DEEPINFRA_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.deepinfra.com/v1',
      models: [
        { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', maxTokens: 131072 },
        { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', maxTokens: 64000, reasoning: true },
      ],
    };

    context.logger.info('DeepInfra provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering DeepInfra provider extension');
  }
}
