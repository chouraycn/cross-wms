// WeChat API module exposes the plugin public contract for cross-wms.
export {
  createWeChatChannelPlugin,
  WECHAT_CHANNEL_ID,
  resolveWeChatAccountFromConfig,
  handleWeChatCallback,
  parseWeChatDecrypted,
} from "./index.js";
export type { WeChatAccountConfig, WeChatWebhookResult, WeChatSendResult, WeChatProbeResult, WeChatMessageInfo } from "./src/types.js";
export { sendWeChatCustomerMessage, sendWeChatTemplateMessage } from "./src/send.js";
export { probeWeChat } from "./src/probe.js";
export {
  verifyWeChatSignature,
  decryptWeChatMessage,
  encryptWeChatMessage,
  verifyAndDecryptWeChatCallback,
} from "./src/crypto.js";
