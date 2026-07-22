import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'canvas',
  name: 'Canvas Tool',
  description: 'Canvas control and A2UI rendering surfaces for paired nodes',
  version: '1.0.0',
  kind: 'tool',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

export default class CanvasTool implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Canvas tool extension');

    const cfg = context.config as Record<string, any>;
    const hostCfg = (cfg['host'] || {}) as Record<string, unknown>;

    const config = {
      host: {
        enabled: Boolean(hostCfg['enabled'] ?? true),
        root: (hostCfg['root'] as string) || '.canvas',
        port: (hostCfg['port'] as number) || 0,
        liveReload: Boolean(hostCfg['liveReload'] ?? true),
      },
      tool: 'canvas',
    };

    context.logger.info('Canvas tool registered with host root:', config.host.root);
  }

  unregister(): void {
    console.log('Unregistering Canvas tool extension');
  }
}
