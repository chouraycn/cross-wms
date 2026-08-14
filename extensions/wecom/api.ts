// WeCom API module exposes the plugin public contract for cross-wms.
export {
  createWeComChannelPlugin,
  WECOM_CHANNEL_ID,
  resolveWeComAccountFromConfig,
  handleWeComCallback,
  parseWeComDecrypted,
} from "./index.js";
export type { WeComAccountConfig, WeComWebhookResult, WeComSendResult, WeComProbeResult, WeComMessageInfo } from "./types.js";
export { sendWeComMessage, sendWeComWebhook } from "./src/send.js";
export { probeWeCom } from "./src/probe.js";
export {
  verifyWeComSignature,
  decryptWeComMessage,
  encryptWeComMessage,
  verifyAndDecryptWeComCallback,
} from "./src/crypto.js";
