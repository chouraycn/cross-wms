import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'deepseek',
  name: 'DeepSeek Provider',
  description: 'DeepSeek reasoning LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class DeepSeekProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering DeepSeek provider extension');

    const apiKey = context.secrets('DEEPSEEK_API_KEY');
    if (!apiKey) {
      context.logger.warn('DEEPSEEK_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.deepseek.com/v1',
      models: [
        { id: 'deepseek-chat', name: 'DeepSeek Chat', maxTokens: 8192 },
        { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', maxTokens: 8192, reasoning: true },
      ],
    };

    context.logger.info('DeepSeek provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering DeepSeek provider extension');
  }
}
