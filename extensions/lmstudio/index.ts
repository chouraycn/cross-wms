import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'lmstudio',
  name: 'LM Studio Provider',
  description: 'LM Studio local OpenAI-compatible LLM provider extension (no API key required)',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

export default class LmStudioProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering LM Studio provider extension');

    const config = {
      baseUrl: 'http://localhost:1234/v1',
      models: [
        { id: 'local-model', name: 'Local Model', maxTokens: 8192 },
      ],
    };

    context.logger.info('LM Studio provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering LM Studio provider extension');
  }
}
