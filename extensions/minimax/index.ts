import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'minimax',
  name: 'MiniMax Provider',
  description: 'MiniMax abab LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class MiniMaxProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering MiniMax provider extension');

    const apiKey = context.secrets('MINIMAX_API_KEY');
    if (!apiKey) {
      context.logger.warn('MINIMAX_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.minimaxi.com/v1',
      models: [
        { id: 'abab6.5s-chat', name: 'ABAB 6.5s Chat', maxTokens: 245760 },
        { id: 'MiniMax-Text-01', name: 'MiniMax Text 01', maxTokens: 1000192 },
      ],
    };

    context.logger.info('MiniMax provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering MiniMax provider extension');
  }
}
