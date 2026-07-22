import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'opencode',
  name: 'Opencode Provider',
  description: 'Opencode CLI harness LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class OpencodeProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Opencode provider extension');

    const apiKey = context.secrets('OPENCODE_API_KEY');
    if (!apiKey) {
      context.logger.warn('OPENCODE_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.opencode.ai/v1',
      models: [
        { id: 'opencode-large', name: 'Opencode Large', maxTokens: 200000 },
      ],
    };

    context.logger.info('Opencode provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Opencode provider extension');
  }
}
