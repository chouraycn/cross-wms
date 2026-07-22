import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'kilocode',
  name: 'Kilo Code Provider',
  description: 'Kilo Code LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class KilocodeProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Kilo Code provider extension');

    const apiKey = context.secrets('KILOCODE_API_KEY');
    if (!apiKey) {
      context.logger.warn('KILOCODE_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.kilocode.ai/v1',
      models: [
        { id: 'kilocode-pro', name: 'Kilo Code Pro', maxTokens: 200000 },
      ],
    };

    context.logger.info('Kilo Code provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Kilo Code provider extension');
  }
}
