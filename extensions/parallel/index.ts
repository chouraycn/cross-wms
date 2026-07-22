import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'parallel',
  name: 'Parallel Provider',
  description: 'Parallel AI LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class ParallelProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Parallel provider extension');

    const apiKey = context.secrets('PARALLEL_API_KEY');
    if (!apiKey) {
      context.logger.warn('PARALLEL_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.parallel.ai/v1',
      models: [
        { id: 'parallel-large', name: 'Parallel Large', maxTokens: 131072 },
      ],
    };

    context.logger.info('Parallel provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering Parallel provider extension');
  }
}
