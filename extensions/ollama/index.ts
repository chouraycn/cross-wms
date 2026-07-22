import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'ollama',
  name: 'Ollama Provider',
  description: 'Ollama local LLM provider extension (no API key required)',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

export default class OllamaProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Ollama provider extension');

    const config = {
      baseUrl: 'http://localhost:11434',
      models: [
        { id: 'llama3.3', name: 'Llama 3.3', maxTokens: 131072 },
        { id: 'qwen2.5', name: 'Qwen 2.5', maxTokens: 32768 },
        { id: 'deepseek-r1', name: 'DeepSeek R1', maxTokens: 131072, reasoning: true },
      ],
    };

    context.logger.info('Ollama provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Ollama provider extension');
  }
}
