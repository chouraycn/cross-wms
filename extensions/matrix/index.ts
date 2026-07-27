/**
 * Matrix 渠道扩展入口
 *
 * 实现 ExtensionProvider 接口，注册 Matrix 渠道适配器到 cross-wms 渠道注册表。
 * 参考 openclaw/extensions/matrix 的架构模式。
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from "../extension-types.js";
import type {
  ChannelId,
  ChannelMeta,
  ChannelCapabilities,
  ChannelConfigAdapter,
  AppConfig,
  ChannelPlugin,
} from "../../server/channels/types.js";
import type {
  MessageSendContext,
  ChannelMessageSendResult,
} from "../../server/channels/message/types.js";
import { createChannelPlugin, getGlobalChannelRegistry } from "../../server/channels/registry.js";
import { createMatrixChannel, type MatrixConfig } from "./api.js";

export const MATRIX_CHANNEL_ID = "matrix" as ChannelId;

interface MatrixAccountConfig extends MatrixConfig {}

const manifest: ExtensionManifest = {
  id: "matrix",
  name: "Matrix Channel",
  description: "Matrix protocol channel extension (open standard for decentralized communication)",
  version: "1.0.0",
  kind: "channel",
  sdkVersion: "1.0.0",
  requiresAuth: true,
  authType: "api-key",
};

const matrixChannelMeta: ChannelMeta = {
  id: MATRIX_CHANNEL_ID,
  label: "Matrix",
  selectionLabel: "Matrix (Decentralized)",
  blurb: "Matrix 开源去中心化通信协议，支持端到端加密和联邦服务器",
  docsPath: "/channels/matrix",
  aliases: ["matrix", "matrix-org"],
  markdownCapable: true,
};

const matrixChannelCapabilities: ChannelCapabilities = {
  chatTypes: ["direct", "group"],
  media: true,
  reactions: true,
  threads: true,
  polls: false,
  mentions: true,
  voice: false,
  video: false,
  typing: true,
};

const matrixChannelConfig: ChannelConfigAdapter<MatrixAccountConfig> = {
  listAccountIds: (config: AppConfig): ChannelId[] => {
    const matrixConfig = config.matrix as Record<string, unknown> | undefined;
    if (matrixConfig && matrixConfig.homeserverUrl && matrixConfig.accessToken && matrixConfig.userId) {
      return [MATRIX_CHANNEL_ID];
    }
    return [];
  },
  resolveAccount: (
    config: AppConfig,
    accountId: ChannelId,
  ): MatrixAccountConfig | null => {
    if (accountId !== MATRIX_CHANNEL_ID) return null;
    const matrixConfig = config.matrix as Record<string, unknown> | undefined;
    if (matrixConfig && matrixConfig.homeserverUrl && matrixConfig.accessToken && matrixConfig.userId) {
      return {
        homeserverUrl: String(matrixConfig.homeserverUrl),
        accessToken: String(matrixConfig.accessToken),
        userId: String(matrixConfig.userId),
        deviceId: matrixConfig.deviceId as string | undefined,
      };
    }
    return null;
  },
  isEnabled: (account: MatrixAccountConfig): boolean => {
    return !!account.homeserverUrl && !!account.accessToken && !!account.userId;
  },
  isConfigured: (account: MatrixAccountConfig): boolean => {
    return !!account.homeserverUrl && !!account.accessToken && !!account.userId;
  },
};

function createMatrixChannelPlugin(): ChannelPlugin<MatrixAccountConfig> {
  const messageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = matrixChannelConfig.resolveAccount(
          { matrix: { homeserverUrl: process.env.MATRIX_HOMESERVER_URL, accessToken: process.env.MATRIX_ACCESS_TOKEN, userId: process.env.MATRIX_USER_ID } } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Matrix account not configured" };
        }

        try {
          const matrix = createMatrixChannel(account);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const result = await matrix.sendTextMessage(ctx.to, text);

          return { success: true, messageId: result.event_id };
        } catch (error) {
          return {
            success: false,
            error: `Matrix send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createChannelPlugin({
    id: MATRIX_CHANNEL_ID,
    meta: matrixChannelMeta,
    capabilities: matrixChannelCapabilities,
    config: matrixChannelConfig,
    message: messageAdapter,
  });
}

export default class MatrixChannelExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info("Registering Matrix channel extension");

    const homeserverUrl = context.secrets("MATRIX_HOMESERVER_URL");
    const accessToken = context.secrets("MATRIX_ACCESS_TOKEN");
    const userId = context.secrets("MATRIX_USER_ID");
    if (!homeserverUrl || !accessToken || !userId) {
      context.logger.warn("MATRIX_HOMESERVER_URL / MATRIX_ACCESS_TOKEN / MATRIX_USER_ID not found in environment");
    }

    const plugin = createMatrixChannelPlugin();
    const registry = getGlobalChannelRegistry();
    registry.register(plugin);

    context.logger.info("Matrix channel plugin registered");
  }

  unregister(): void {
    const registry = getGlobalChannelRegistry();
    registry.unregister(MATRIX_CHANNEL_ID);
    console.log("Unregistered Matrix channel extension");
  }
}

export { createMatrixChannel };
export type {
  MatrixConfig,
  MatrixChannel,
  MatrixMessage,
  MatrixSendMessageResult,
  MatrixRoom,
} from "./api.js";
