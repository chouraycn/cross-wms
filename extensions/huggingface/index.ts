import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'huggingface',
  name: 'Hugging Face Provider',
  description: 'Hugging Face inference LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class HuggingFaceProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Hugging Face provider extension');

    const apiKey = context.secrets('HF_TOKEN');
    if (!apiKey) {
      context.logger.warn('HF_TOKEN not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api-inference.huggingface.co',
      models: [
        { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', maxTokens: 131072 },
        { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', maxTokens: 32768 },
      ],
    };

    context.logger.info('Hugging Face provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Hugging Face provider extension');
  }
}
