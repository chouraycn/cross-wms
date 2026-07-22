import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'perplexity',
  name: 'Perplexity Provider',
  description: 'Perplexity online/reasoning LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class PerplexityProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Perplexity provider extension');

    const apiKey = context.secrets('PERPLEXITY_API_KEY');
    if (!apiKey) {
      context.logger.warn('PERPLEXITY_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.perplexity.ai',
      models: [
        { id: 'sonar-pro', name: 'Sonar Pro', maxTokens: 200000 },
        { id: 'sonar-reasoning-pro', name: 'Sonar Reasoning Pro', maxTokens: 127072, reasoning: true },
        { id: 'sonar', name: 'Sonar', maxTokens: 127072 },
      ],
    };

    context.logger.info('Perplexity provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Perplexity provider extension');
  }
}
