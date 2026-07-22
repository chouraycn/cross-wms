import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'moonshot',
  name: 'Moonshot Provider',
  description: 'Moonshot AI Kimi LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class MoonshotProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Moonshot provider extension');

    const apiKey = context.secrets('MOONSHOT_API_KEY');
    if (!apiKey) {
      context.logger.warn('MOONSHOT_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.moonshot.cn/v1',
      models: [
        { id: 'moonshot-v1-128k', name: 'Moonshot V1 128K', maxTokens: 128000 },
        { id: 'kimi-latest', name: 'Kimi Latest', maxTokens: 256000 },
      ],
    };

    context.logger.info('Moonshot provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Moonshot provider extension');
  }
}
