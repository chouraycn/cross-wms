import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'diffs',
  name: 'Diffs Tool',
  description: 'Read-only diff viewer plugin and file renderer for agents',
  version: '1.0.0',
  kind: 'tool',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

export default class DiffsTool implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Diffs tool extension');

    const defaults = (context.config['defaults'] as Record<string, unknown>) || {};
    const config = {
      viewerBaseUrl: (context.config['viewerBaseUrl'] as string) || '',
      defaults: {
        layout: defaults['layout'] || 'unified',
        theme: defaults['theme'] || 'dark',
        mode: defaults['mode'] || 'both',
        ttlSeconds: defaults['ttlSeconds'] || 1800,
      },
      security: {
        allowRemoteViewer: Boolean((context.config['security'] as Record<string, unknown> | undefined)?.['allowRemoteViewer'] ?? false),
      },
      tool: 'diffs',
    };

    context.logger.info('Diffs tool registered with layout:', config.defaults.layout);
  }

  unregister(): void {
    console.log('Unregistering Diffs tool extension');
  }
}
