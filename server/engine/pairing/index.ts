export * from "./types.js";

export { PairingCrypto, pairingCrypto } from "./pairing-crypto.js";
export type { PairingCryptoOptions } from "./types.js";

export {
  PairingCodeGenerator,
  pairingCodeGenerator,
  generatePairingCode,
  validatePairingCodeFormat,
} from "./pairing-code.js";
export type { PairingCodeGeneratorOptions } from "./pairing-code.js";

export { PairingStore, pairingStore } from "./pairing-store.js";
export type { PairingStoreOptions } from "./types.js";

export {
  PairingSessionManager,
  pairingSessionManager,
} from "./pairing-session.js";
export type {
  PairingSessionManagerOptions,
  SessionStateChangeHandler,
} from "./pairing-session.js";

export { PairingProtocol } from "./pairing-protocol.js";
export type {
  ProtocolRole,
  MessageHandler,
} from "./pairing-protocol.js";
export type { PairingProtocolOptions } from "./types.js";

export {
  PairingDiscovery,
  ManualDiscoveryProvider,
  pairingDiscovery,
} from "./pairing-discovery.js";
export type {
  DiscoveryProvider,
  DeviceDiscoveredHandler,
  DeviceLostHandler,
  DiscoveryTransport,
} from "./pairing-discovery.js";
export type { DiscoveryOptions } from "./types.js";

export { PairingServer } from "./pairing-server.js";
export type {
  PairingServerConnection,
  PairingRequestHandler,
  PairingCompleteHandler,
} from "./pairing-server.js";
export type { PairingServerOptions } from "./types.js";

export { PairingClient } from "./pairing-client.js";
export type { ClientConnectionHandler } from "./pairing-client.js";
export type { PairingClientOptions } from "./types.js";

export {
  PairingRuntime,
  createPairingRuntime,
  generateDeviceId,
  createLocalDeviceInfo,
} from "./pairing-runtime.js";
export type {
  PairingRuntimeOptions,
  PairingCallbacks,
  RuntimeMode,
} from "./pairing-runtime.js";
