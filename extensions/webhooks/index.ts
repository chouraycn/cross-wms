import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'webhooks',
  name: 'Webhooks Service',
  description: 'Inbound webhook receiver and dispatcher service extension',
  version: '1.0.0',
  kind: 'service',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

export default class WebhooksService implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Webhooks service extension');

    const config = {
      path: (context.config['path'] as string) || '/webhooks',
      secret: context.secrets('WEBHOOK_SECRET'),
      maxPayloadBytes: (context.config['maxPayloadBytes'] as number) || 1048576,
    };

    context.logger.info('Webhooks service registered with path:', config.path);
  }

  unregister(): void {
    console.log('Unregistering Webhooks service extension');
  }
}
