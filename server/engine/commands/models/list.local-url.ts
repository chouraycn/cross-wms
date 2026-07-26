/** Local URL classifier for model provider status/list output. */
// 移植自 openclaw/src/commands/models/list.local-url.ts
//
// 降级说明：
//  - normalizeLowercaseStringOrEmpty 来自 @openclaw/normalization-core/string-coerce
//    → cross-wms 已在 ../../infra/string-coerce.ts 实现同源函数
import { normalizeLowercaseStringOrEmpty } from "../../infra/string-coerce.js";

/** Returns true for loopback, wildcard, and mDNS local base URLs. */
export const isLocalBaseUrl = (baseUrl: string) => {
  try {
    const url = new URL(baseUrl);
    const host = normalizeLowercaseStringOrEmpty(url.hostname).replace(/^\[|\]$/g, "");
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::" ||
      host === "::1" ||
      host.endsWith(".local")
    );
  } catch {
    return false;
  }
};
