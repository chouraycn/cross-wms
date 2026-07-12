import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types';
import { App, ExpressReceiver } from '@slack/bolt';

const manifest: ExtensionManifest = {
  id: 'slack',
  name: 'Slack',
  description: 'Slack channel plugin for AI messaging',
  version: '1.0.0',
  kind: 'channel',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

let app: App | null = null;

export default {
  manifest,
  register(context: ExtensionContext) {
    const botToken = context.secrets('SLACK_BOT_TOKEN');
    const signingSecret = context.secrets('SLACK_SIGNING_SECRET');
    const port = parseInt(context.config.SLACK_PORT || '3000', 10);

    if (!botToken || !signingSecret) {
      context.logger.warn('Slack credentials not configured, skipping Slack channel registration');
      return;
    }

    try {
      const receiver = new ExpressReceiver({
        signingSecret,
      });

      app = new App({
        token: botToken,
        receiver,
      });

      app.message('.*', async ({ message, say }) => {
        const text = (message as { text?: string }).text;
        if (text) {
          context.logger.info(`Received Slack message: ${text}`);
        }
      });

      app.start(port).then(() => {
        context.logger.info(`Slack app started on port ${port}`);
      }).catch(err => {
        context.logger.error('Failed to start Slack app:', err);
      });
    } catch (err) {
      context.logger.error('Failed to initialize Slack app:', err);
    }
  },
  unregister() {
    if (app) {
      app.stop();
      app = null;
    }
  },
} as ExtensionProvider;
