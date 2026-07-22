import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'cerebras',
  name: 'Cerebras Provider',
  description: 'Cerebras fast OpenAI-compatible inference provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class CerebrasProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Cerebras provider extension');

    const apiKey = context.secrets('CEREBRAS_API_KEY');
    if (!apiKey) {
      context.logger.warn('CEREBRAS_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.cerebras.ai/v1',
      models: [
        { id: 'llama3.1-8b', name: 'Llama 3.1 8B', maxTokens: 8192 },
        { id: 'gpt-oss-120b', name: 'GPT OSS 120B', maxTokens: 8192 },
        { id: 'qwen-3-235b-a22b-instruct-2507', name: 'Qwen 3 235B Instruct', maxTokens: 8192 },
      ],
    };

    context.logger.info('Cerebras provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Cerebras provider extension');
  }
}
