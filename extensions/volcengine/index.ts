import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'volcengine',
  name: 'Volcengine Provider',
  description: 'Volcengine Ark (ByteDance) LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class VolcengineProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Volcengine provider extension');

    const apiKey = context.secrets('ARK_API_KEY');
    if (!apiKey) {
      context.logger.warn('ARK_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      models: [
        { id: 'doubao-1-5-pro-256k', name: 'Doubao 1.5 Pro 256K', maxTokens: 256000 },
        { id: 'doubao-pro-32k', name: 'Doubao Pro 32K', maxTokens: 32000 },
        { id: 'deepseek-r1-250120', name: 'DeepSeek R1', maxTokens: 64000, reasoning: true },
      ],
    };

    context.logger.info('Volcengine provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Volcengine provider extension');
  }
}
