import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'codex',
  name: 'OpenAI Codex Provider',
  description: 'OpenAI Codex harness LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class CodexProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering OpenAI Codex provider extension');

    const apiKey = context.secrets('OPENAI_API_KEY');
    if (!apiKey) {
      context.logger.warn('OPENAI_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.openai.com/v1',
      models: [
        { id: 'codex-mini-latest', name: 'Codex Mini', maxTokens: 200000, reasoning: true },
        { id: 'gpt-4.1', name: 'GPT-4.1', maxTokens: 1047576 },
        { id: 'o3', name: 'o3', maxTokens: 200000, reasoning: true },
      ],
    };

    context.logger.info('OpenAI Codex provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering OpenAI Codex provider extension');
  }
}
