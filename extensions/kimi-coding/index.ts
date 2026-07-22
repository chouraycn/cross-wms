import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'kimi-coding',
  name: 'Kimi Coding Provider',
  description: 'Moonshot Kimi Coding specialized LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class KimiCodingProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Kimi Coding provider extension');

    const apiKey = context.secrets('KIMI_API_KEY');
    if (!apiKey) {
      context.logger.warn('KIMI_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.moonshot.cn/v1',
      models: [
        { id: 'kimi-coding', name: 'Kimi Coding', maxTokens: 256000 },
      ],
    };

    context.logger.info('Kimi Coding provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Kimi Coding provider extension');
  }
}
