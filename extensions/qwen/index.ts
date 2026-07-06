import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'qwen',
  name: 'Qwen Provider',
  description: 'Qwen LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class QwenProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Qwen provider extension');
    
    const apiKey = context.secrets('QWEN_API_KEY');
    if (!apiKey) {
      context.logger.warn('QWEN_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: [
        { id: 'qwen-turbo', name: 'Qwen Turbo', maxTokens: 128000 },
        { id: 'qwen-plus', name: 'Qwen Plus', maxTokens: 128000 },
        { id: 'qwen-max', name: 'Qwen Max', maxTokens: 128000 },
        { id: 'qwen-vl-plus', name: 'Qwen VL Plus', maxTokens: 128000 },
      ],
    };

    context.logger.info('Qwen provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Qwen provider extension');
  }
}