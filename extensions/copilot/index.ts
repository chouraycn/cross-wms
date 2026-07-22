import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'copilot',
  name: 'GitHub Copilot Provider',
  description: 'GitHub Copilot LLM provider extension (OpenAI-compatible)',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class CopilotProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering GitHub Copilot provider extension');

    const token = context.secrets('GITHUB_COPILOT_TOKEN');
    if (!token) {
      context.logger.warn('GITHUB_COPILOT_TOKEN not found in environment');
    }

    const config = {
      apiKey: token,
      baseUrl: 'https://api.githubcopilot.com',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 128000 },
        { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', maxTokens: 200000 },
      ],
    };

    context.logger.info('GitHub Copilot provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering GitHub Copilot provider extension');
  }
}
