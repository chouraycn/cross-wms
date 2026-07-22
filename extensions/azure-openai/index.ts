import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'azure-openai',
  name: 'Azure OpenAI Provider',
  description: 'Azure OpenAI Service LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class AzureOpenAIProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Azure OpenAI provider extension');

    const apiKey = context.secrets('AZURE_OPENAI_API_KEY');
    if (!apiKey) {
      context.logger.warn('AZURE_OPENAI_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: context.config['endpoint'] || 'https://YOUR-RESOURCE.openai.azure.com',
      apiVersion: context.config['apiVersion'] || '2024-10-21',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 128000 },
        { id: 'o3-mini', name: 'o3-mini', maxTokens: 200000, reasoning: true },
      ],
    };

    context.logger.info('Azure OpenAI provider registered with apiVersion:', config.apiVersion);
  }

  unregister(): void {
    console.log('Unregistering Azure OpenAI provider extension');
  }
}
