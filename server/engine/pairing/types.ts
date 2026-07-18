export type DeviceId = string;

export type PairingCode = string;

export type PairingSessionId = string;

export type PairingState =
  | "idle"
  | "discovering"
  | "connecting"
  | "authenticating"
  | "exchanging-keys"
  | "paired"
  | "failed"
  | "expired";

export type PairingMethod = "qrcode" | "manual-code" | "network-discovery" | "bluetooth";

export type CryptoAlgorithm = "aes-256-gcm" | "chacha20-poly1305";

export type KeyExchangeAlgorithm = "ecdh-p256" | "x25519";

export interface DeviceInfo {
  deviceId: DeviceId;
  deviceName: string;
  deviceType: string;
  osName?: string;
  osVersion?: string;
  appVersion?: string;
  capabilities?: string[];
  publicKey?: string;
  metadata?: Record<string, unknown>;
}

export interface PairingCodeInfo {
  code: PairingCode;
  expiresAt: number;
  createdAt: number;
  deviceId?: DeviceId;
  used: boolean;
}

export interface PairingSession {
  sessionId: PairingSessionId;
  state: PairingState;
  localDevice: DeviceInfo;
  remoteDevice?: DeviceInfo;
  pairingMethod: PairingMethod;
  pairingCode?: PairingCodeInfo;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  sharedSecret?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface PairedDevice {
  deviceId: DeviceId;
  deviceInfo: DeviceInfo;
  pairedAt: number;
  lastSeenAt: number;
  isActive: boolean;
  trustLevel: number;
  sharedSecret?: string;
  metadata?: Record<string, unknown>;
}

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag?: string;
  algorithm: CryptoAlgorithm;
}

export interface SignatureData {
  signature: string;
  algorithm: string;
  publicKey?: string;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface DiscoveredDevice {
  deviceId: DeviceId;
  deviceName: string;
  address: string;
  transport: "tcp" | "udp" | "bluetooth" | "websocket";
  signalStrength?: number;
  lastSeen: number;
  serviceName?: string;
  txtRecord?: Record<string, string>;
}

export interface PairingMessage {
  type: PairingMessageType;
  sessionId?: PairingSessionId;
  payload?: unknown;
  timestamp: number;
}

export type PairingMessageType =
  | "hello"
  | "hello-ack"
  | "code-request"
  | "code-response"
  | "challenge"
  | "challenge-response"
  | "key-exchange"
  | "key-exchange-ack"
  | "device-info"
  | "device-info-ack"
  | "pairing-complete"
  | "pairing-complete-ack"
  | "error"
  | "ping"
  | "pong";

export interface PairingStoreOptions {
  storagePath?: string;
  ttlMs?: number;
  maxPendingPairings?: number;
}

export interface PairingServerOptions extends PairingStoreOptions {
  port?: number;
  host?: string;
  enableDiscovery?: boolean;
  discoveryServiceName?: string;
}

export interface PairingClientOptions {
  connectTimeoutMs?: number;
  handshakeTimeoutMs?: number;
}

export interface PairingCryptoOptions {
  keyExchangeAlgorithm?: KeyExchangeAlgorithm;
  encryptionAlgorithm?: CryptoAlgorithm;
  keyDerivationRounds?: number;
}

export interface PairingProtocolOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  handshakeTimeoutMs?: number;
}

export interface DiscoveryOptions {
  serviceType?: string;
  timeoutMs?: number;
  interfaces?: string[];
}
