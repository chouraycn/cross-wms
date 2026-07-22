import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'github-models',
  name: 'GitHub Models Provider',
  description: 'GitHub Models inference LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class GitHubModelsProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering GitHub Models provider extension');

    const token = context.secrets('GITHUB_TOKEN');
    if (!token) {
      context.logger.warn('GITHUB_TOKEN not found in environment');
    }

    const config = {
      apiKey: token,
      baseUrl: 'https://models.inference.ai.azure.com',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 128000 },
        { id: 'Mistral-large', name: 'Mistral Large', maxTokens: 32000 },
        { id: 'Phi-3.5-mini-instruct', name: 'Phi 3.5 Mini', maxTokens: 8192 },
      ],
    };

    context.logger.info('GitHub Models provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering GitHub Models provider extension');
  }
}
