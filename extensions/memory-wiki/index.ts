import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'memory-wiki',
  name: 'Memory Wiki Host',
  description: 'Wiki-style persistent memory host extension for structured knowledge',
  version: '1.0.0',
  kind: 'memory-host',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

export default class MemoryWikiHost implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Memory Wiki host extension');

    const config = {
      root: (context.config['root'] as string) || '.memory-wiki',
      embeddingProvider: (context.config['embeddingProvider'] as string) || 'voyage',
      topK: (context.config['topK'] as number) || 5,
    };

    context.logger.info('Memory Wiki host registered with root:', config.root);
  }

  unregister(): void {
    console.log('Unregistering Memory Wiki host extension');
  }
}
