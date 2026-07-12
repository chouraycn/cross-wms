import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types';
import { Client, GatewayIntentBits, Message } from 'discord.js';

const manifest: ExtensionManifest = {
  id: 'discord',
  name: 'Discord',
  description: 'Discord channel plugin for AI messaging',
  version: '1.0.0',
  kind: 'channel',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

let discordClient: Client | null = null;

export default {
  manifest,
  register(context: ExtensionContext) {
    const token = context.secrets('DISCORD_TOKEN');
    if (!token) {
      context.logger.warn('Discord token not configured, skipping Discord channel registration');
      return;
    }

    try {
      discordClient = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
        ],
      });

      discordClient.on('ready', () => {
        context.logger.info(`Discord client logged in as ${discordClient?.user?.tag}`);
      });

      discordClient.on('messageCreate', async (message: Message) => {
        if (message.author.bot) return;

        context.logger.info(`Received Discord message from ${message.author.tag}: ${message.content}`);
      });

      discordClient.login(token).catch(err => {
        context.logger.error('Failed to login to Discord:', err);
      });
    } catch (err) {
      context.logger.error('Failed to initialize Discord client:', err);
    }
  },
  unregister() {
    if (discordClient) {
      discordClient.destroy();
      discordClient = null;
    }
  },
} as ExtensionProvider;
