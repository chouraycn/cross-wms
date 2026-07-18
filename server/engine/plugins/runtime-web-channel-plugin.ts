// 移植自 openclaw/src/plugins/runtime-web-channel-plugin.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function getActiveWebListener(...args: unknown[]): unknown {
  throw new Error("not implemented: getActiveWebListener");
}
export function getWebAuthAgeMs(...args: unknown[]): unknown {
  throw new Error("not implemented: getWebAuthAgeMs");
}
export function logWebSelfId(...args: unknown[]): unknown {
  throw new Error("not implemented: logWebSelfId");
}
export function loginWeb(...args: unknown[]): unknown {
  throw new Error("not implemented: loginWeb");
}
export function logoutWeb(...args: unknown[]): unknown {
  throw new Error("not implemented: logoutWeb");
}
export function readWebSelfId(...args: unknown[]): unknown {
  throw new Error("not implemented: readWebSelfId");
}
export function webAuthExists(...args: unknown[]): unknown {
  throw new Error("not implemented: webAuthExists");
}
export function formatError(...args: unknown[]): unknown {
  throw new Error("not implemented: formatError");
}
export function getStatusCode(...args: unknown[]): unknown {
  throw new Error("not implemented: getStatusCode");
}
export function pickWebChannel(...args: unknown[]): unknown {
  throw new Error("not implemented: pickWebChannel");
}
export function resolveWebChannelAuthDir(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveWebChannelAuthDir");
}
export function loadWebMedia(...args: unknown[]): unknown {
  throw new Error("not implemented: loadWebMedia");
}
export function loadWebMediaRaw(...args: unknown[]): unknown {
  throw new Error("not implemented: loadWebMediaRaw");
}
export function monitorWebChannel(...args: unknown[]): unknown {
  throw new Error("not implemented: monitorWebChannel");
}
export function monitorWebInbox(...args: unknown[]): unknown {
  throw new Error("not implemented: monitorWebInbox");
}
export function optimizeImageToJpeg(...args: unknown[]): unknown {
  throw new Error("not implemented: optimizeImageToJpeg");
}
export function startWebLoginWithQr(...args: unknown[]): unknown {
  throw new Error("not implemented: startWebLoginWithQr");
}
export function waitForWebChannelConnection(...args: unknown[]): unknown {
  throw new Error("not implemented: waitForWebChannelConnection");
}
export function waitForWebLogin(...args: unknown[]): unknown {
  throw new Error("not implemented: waitForWebLogin");
}
export function getDefaultLocalRoots(...args: unknown[]): unknown {
  throw new Error("not implemented: getDefaultLocalRoots");
}
export const extractMediaPlaceholder: unknown = undefined;
export const extractText: unknown = undefined;
