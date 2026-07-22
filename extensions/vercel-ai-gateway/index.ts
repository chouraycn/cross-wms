import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'vercel-ai-gateway',
  name: 'Vercel AI Gateway Provider',
  description: 'Vercel AI Gateway multi-provider LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class VercelAiGatewayProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Vercel AI Gateway provider extension');

    const apiKey = context.secrets('AI_GATEWAY_API_KEY');
    if (!apiKey) {
      context.logger.warn('AI_GATEWAY_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://ai-gateway.vercel.sh/v1',
      models: [
        { id: 'openai/gpt-4o', name: 'GPT-4o', maxTokens: 128000 },
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', maxTokens: 200000 },
        { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', maxTokens: 131072 },
      ],
    };

    context.logger.info('Vercel AI Gateway provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Vercel AI Gateway provider extension');
  }
}
