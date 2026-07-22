import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'active-memory',
  name: 'Active Memory Host',
  description: 'Active working-memory host extension for short-lived session memory',
  version: '1.0.0',
  kind: 'memory-host',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

export default class ActiveMemoryHost implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Active Memory host extension');

    const config = {
      maxItems: (context.config['maxItems'] as number) || 256,
      ttlSeconds: (context.config['ttlSeconds'] as number) || 3600,
      backend: (context.config['backend'] as string) || 'sqlite',
    };

    context.logger.info('Active Memory host registered with backend:', config.backend);
  }

  unregister(): void {
    console.log('Unregistering Active Memory host extension');
  }
}
