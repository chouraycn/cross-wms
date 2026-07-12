import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types';
import { Telegraf, type Context } from 'telegraf';

const manifest: ExtensionManifest = {
  id: 'telegram',
  name: 'Telegram',
  description: 'Telegram channel plugin for AI messaging',
  version: '1.0.0',
  kind: 'channel',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

let bot: Telegraf<Context> | null = null;

export default {
  manifest,
  register(context: ExtensionContext) {
    const token = context.secrets('TELEGRAM_TOKEN');
    if (!token) {
      context.logger.warn('Telegram token not configured, skipping Telegram channel registration');
      return;
    }

    try {
      bot = new Telegraf(token);

      bot.start((ctx) => ctx.reply('Welcome! I am your AI assistant.'));

      bot.on('message', (ctx) => {
        const message = ctx.message as { text?: string };
        if (message.text) {
          context.logger.info(`Received Telegram message from ${ctx.from?.username}: ${message.text}`);
        }
      });

      bot.launch().then(() => {
        context.logger.info('Telegram bot launched successfully');
      }).catch(err => {
        context.logger.error('Failed to launch Telegram bot:', err);
      });
    } catch (err) {
      context.logger.error('Failed to initialize Telegram bot:', err);
    }
  },
  unregister() {
    if (bot) {
      bot.stop();
      bot = null;
    }
  },
} as ExtensionProvider;
