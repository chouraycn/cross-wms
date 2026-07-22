import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'llama-cpp',
  name: 'llama.cpp Provider',
  description: 'llama.cpp local server OpenAI-compatible LLM provider extension (no API key required)',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

export default class LlamaCppProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering llama.cpp provider extension');

    const config = {
      baseUrl: 'http://localhost:8080',
      models: [
        { id: 'local-model', name: 'Local GGUF Model', maxTokens: 8192 },
      ],
    };

    context.logger.info('llama.cpp provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering llama.cpp provider extension');
  }
}
