import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'groq',
  name: 'Groq Provider',
  description: 'Groq LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class GroqProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Groq provider extension');
    
    const apiKey = context.secrets('GROQ_API_KEY');
    if (!apiKey) {
      context.logger.warn('GROQ_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.groq.com/openai/v1',
      models: [
        { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', maxTokens: 32768 },
        { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B', maxTokens: 128000 },
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', maxTokens: 128000 },
      ],
    };

    context.logger.info('Groq provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Groq provider extension');
  }
}