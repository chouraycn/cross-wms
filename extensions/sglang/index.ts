import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'sglang',
  name: 'SGLang Provider',
  description: 'SGLang local server OpenAI-compatible LLM provider extension (no API key required)',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

export default class SGLangProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering SGLang provider extension');

    const config = {
      baseUrl: 'http://localhost:30000/v1',
      models: [
        { id: 'local-model', name: 'Local SGLang Model', maxTokens: 8192 },
      ],
    };

    context.logger.info('SGLang provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering SGLang provider extension');
  }
}
