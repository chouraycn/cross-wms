import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'tavily',
  name: 'Tavily Web Search',
  description: 'Tavily AI-optimized web search provider extension',
  version: '1.0.0',
  kind: 'web-search',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class TavilyWebSearch implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Tavily web search extension');

    const apiKey = context.secrets('TAVILY_API_KEY');
    if (!apiKey) {
      context.logger.warn('TAVILY_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.tavily.com',
      provider: 'tavily',
    };

    context.logger.info('Tavily web search registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Tavily web search extension');
  }
}
