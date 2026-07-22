import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'tencent',
  name: 'Tencent Hunyuan Provider',
  description: 'Tencent Hunyuan LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class TencentProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Tencent Hunyuan provider extension');

    const apiKey = context.secrets('TENCENT_API_KEY');
    if (!apiKey) {
      context.logger.warn('TENCENT_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
      models: [
        { id: 'hunyuan-turbos-latest', name: 'Hunyuan Turbo S', maxTokens: 28000 },
        { id: 'hunyuan-large', name: 'Hunyuan Large', maxTokens: 256000 },
        { id: 'deepseek-r1', name: 'DeepSeek R1', maxTokens: 64000, reasoning: true },
      ],
    };

    context.logger.info('Tencent Hunyuan provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Tencent Hunyuan provider extension');
  }
}
