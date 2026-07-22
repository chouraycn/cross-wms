import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'qianfan',
  name: 'Qianfan Provider',
  description: 'Baidu Qianfan (ERNIE) LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class QianfanProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Qianfan provider extension');

    const apiKey = context.secrets('QIANFAN_API_KEY');
    if (!apiKey) {
      context.logger.warn('QIANFAN_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://qianfan.baidubce.com/v2',
      models: [
        { id: 'ernie-4.0-8k-latest', name: 'ERNIE 4.0 8K', maxTokens: 8192 },
        { id: 'ernie-speed-128k', name: 'ERNIE Speed 128K', maxTokens: 128000 },
        { id: 'deepseek-r1', name: 'DeepSeek R1', maxTokens: 64000, reasoning: true },
      ],
    };

    context.logger.info('Qianfan provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Qianfan provider extension');
  }
}
