import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'xai',
  name: 'XAI Provider',
  description: 'XAI LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class XAIProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering XAI provider extension');
    
    const apiKey = context.secrets('XAI_API_KEY');
    if (!apiKey) {
      context.logger.warn('XAI_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.x.ai/v1',
      models: [
        { id: 'grok-beta', name: 'Grok Beta', maxTokens: 128000 },
        { id: 'grok-beta-preview', name: 'Grok Beta Preview', maxTokens: 128000 },
      ],
    };

    context.logger.info('XAI provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering XAI provider extension');
  }
}