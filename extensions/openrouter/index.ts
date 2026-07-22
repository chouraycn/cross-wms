import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'openrouter',
  name: 'OpenRouter Provider',
  description: 'OpenRouter multi-model aggregator LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class OpenRouterProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering OpenRouter provider extension');

    const apiKey = context.secrets('OPENROUTER_API_KEY');
    if (!apiKey) {
      context.logger.warn('OPENROUTER_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://openrouter.ai/api/v1',
      models: [
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', maxTokens: 200000 },
        { id: 'openai/gpt-4o', name: 'GPT-4o', maxTokens: 128000 },
        { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', maxTokens: 1000000 },
      ],
    };

    context.logger.info('OpenRouter provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering OpenRouter provider extension');
  }
}
