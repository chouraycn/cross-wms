import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types';
import { create } from 'venom-bot';

const manifest: ExtensionManifest = {
  id: 'whatsapp',
  name: 'WhatsApp',
  description: 'WhatsApp channel plugin for AI messaging',
  version: '1.0.0',
  kind: 'channel',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default {
  manifest,
  register(context: ExtensionContext) {
    try {
      create({
        session: 'crosswms-whatsapp',
        multidevice: true,
      })
        .then((client) => {
          client.onMessage((message) => {
            if (message.body) {
              context.logger.info(`Received WhatsApp message from ${message.from}: ${message.body}`);
            }
          });

          context.logger.info('WhatsApp client initialized, scan QR code to login');
        })
        .catch((err) => {
          context.logger.error('Failed to initialize WhatsApp client:', err);
        });
    } catch (err) {
      context.logger.error('Failed to initialize WhatsApp:', err);
    }
  },
  unregister() {
  },
} as ExtensionProvider;
