import { randomUUID } from "node:crypto";
import { logger } from "../../logger.js";
import { PairingServer } from "./pairing-server.js";
import { PairingClient } from "./pairing-client.js";
import { PairingDiscovery } from "./pairing-discovery.js";
import { PairingSessionManager } from "./pairing-session.js";
import { PairingCrypto } from "./pairing-crypto.js";
import { PairingCodeGenerator } from "./pairing-code.js";
import type {
  DeviceInfo,
  PairingSession,
  PairedDevice,
  PairingMethod,
  PairingState,
  PairingServerOptions,
  PairingClientOptions,
  PairingMessage,
  DiscoveredDevice,
} from "./types.js";

export type RuntimeMode = "server" | "client" | "both";

export interface PairingRuntimeOptions {
  mode?: RuntimeMode;
  serverOptions?: PairingServerOptions;
  clientOptions?: PairingClientOptions;
}

export interface PairingCallbacks {
  onSessionCreated?: (session: PairingSession) => void;
  onStateChange?: (session: PairingSession, oldState: PairingState, newState: PairingState) => void;
  onPairingComplete?: (device: PairedDevice, session: PairingSession) => void;
  onPairingFailed?: (session: PairingSession, error: string) => void;
  onDeviceDiscovered?: (device: DiscoveredDevice) => void;
  onDeviceLost?: (deviceId: string) => void;
}

export class PairingRuntime {
  private mode: RuntimeMode;
  private localDevice: DeviceInfo;
  private server?: PairingServer;
  private client?: PairingClient;
  private crypto: PairingCrypto;
  private codeGenerator: PairingCodeGenerator;
  private callbacks: PairingCallbacks = {};
  private isInitialized = false;

  constructor(localDevice: DeviceInfo, options: PairingRuntimeOptions = {}) {
    this.localDevice = localDevice;
    this.mode = options.mode ?? "both";
    this.crypto = new PairingCrypto();
    this.codeGenerator = new PairingCodeGenerator();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    logger.info(`[PairingRuntime] Initializing in ${this.mode} mode`);

    if (this.mode === "server" || this.mode === "both") {
      this.server = new PairingServer(this.localDevice);
      await this.server.start();
      this.setupServerCallbacks();
    }

    if (this.mode === "client" || this.mode === "both") {
      this.client = new PairingClient(this.localDevice);
      this.setupClientCallbacks();
    }

    this.isInitialized = true;
    logger.info("[PairingRuntime] Initialized successfully");
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    logger.info("[PairingRuntime] Shutting down");

    if (this.server) {
      await this.server.stop();
    }

    if (this.client) {
      await this.client.disconnect();
    }

    this.isInitialized = false;
    logger.info("[PairingRuntime] Shutdown complete");
  }

  setCallbacks(callbacks: PairingCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  startPairing(pairingMethod: PairingMethod = "manual-code"): PairingSession {
    this.ensureServer();
    return this.server!.createPairingSession(pairingMethod);
  }

  async joinPairing(
    pairingCode: string,
    connect: () => Promise<{
      send: (message: PairingMessage) => Promise<void>;
      close: () => void;
    }>,
  ): Promise<PairingSession> {
    this.ensureClient();
    return this.client!.connectWithCode(pairingCode, connect);
  }

  async discoverDevices(timeoutMs?: number): Promise<DiscoveredDevice[]> {
    this.ensureClient();
    return this.client!.discoverDevices(timeoutMs);
  }

  getSession(sessionId: string): PairingSession | undefined {
    if (this.server) {
      const session = this.server.getSession(sessionId);
      if (session) return session;
    }

    if (this.client) {
      const session = this.client.getCurrentSession();
      if (session?.sessionId === sessionId) return session;
    }

    return undefined;
  }

  listSessions(): PairingSession[] {
    const sessions: PairingSession[] = [];

    if (this.server) {
      sessions.push(...this.server.listSessions());
    }

    if (this.client) {
      const current = this.client.getCurrentSession();
      if (current) {
        sessions.push(current);
      }
    }

    return sessions;
  }

  listPairedDevices(): PairedDevice[] {
    const devices: PairedDevice[] = [];
    const seen = new Set<string>();

    if (this.server) {
      for (const device of this.server.listPairedDevices()) {
        if (!seen.has(device.deviceId)) {
          devices.push(device);
          seen.add(device.deviceId);
        }
      }
    }

    if (this.client) {
      for (const device of this.client.getPairedDevices()) {
        if (!seen.has(device.deviceId)) {
          devices.push(device);
          seen.add(device.deviceId);
        }
      }
    }

    return devices;
  }

  isDevicePaired(deviceId: string): boolean {
    if (this.server?.getPairedDevice(deviceId)) {
      return true;
    }
    if (this.client?.getPairedDevice(deviceId)) {
      return true;
    }
    return false;
  }

  removePairedDevice(deviceId: string): boolean {
    let removed = false;

    if (this.server) {
      removed = this.server.removePairedDevice(deviceId) || removed;
    }

    if (this.client) {
      removed = this.client.removePairedDevice(deviceId) || removed;
    }

    return removed;
  }

  generatePairingCode(): string {
    return this.codeGenerator.generate().code;
  }

  validatePairingCode(code: string): boolean {
    return this.codeGenerator.validate(code);
  }

  getServer(): PairingServer | undefined {
    return this.server;
  }

  getClient(): PairingClient | undefined {
    return this.client;
  }

  getCrypto(): PairingCrypto {
    return this.crypto;
  }

  getCodeGenerator(): PairingCodeGenerator {
    return this.codeGenerator;
  }

  getLocalDevice(): DeviceInfo {
    return this.localDevice;
  }

  updateLocalDevice(updates: Partial<DeviceInfo>): void {
    this.localDevice = { ...this.localDevice, ...updates };

    if (this.server) {
      this.server.updateLocalDevice(updates);
    }

    if (this.client) {
      this.client.updateLocalDevice(updates);
    }
  }

  getMode(): RuntimeMode {
    return this.mode;
  }

  isActive(): boolean {
    return this.isInitialized;
  }

  async handleServerMessage(connectionId: string, message: PairingMessage): Promise<void> {
    this.ensureServer();
    await this.server!.handleMessage(connectionId, message);
  }

  async handleClientMessage(message: PairingMessage): Promise<void> {
    this.ensureClient();
    await this.client!.handleMessage(message);
  }

  private setupServerCallbacks(): void {
    if (!this.server) return;

    const sessionManager = this.server.getSessionManager();

    sessionManager.onStateChange((session, oldState, newState) => {
      this.callbacks.onStateChange?.(session, oldState, newState);

      if (newState === "failed" && session.error) {
        this.callbacks.onPairingFailed?.(session, session.error);
      }
    });

    this.server.onPairingComplete((device, session) => {
      this.callbacks.onPairingComplete?.(device, session);
    });

    const discovery = this.server.getDiscovery();
    discovery.onDeviceDiscovered((device) => {
      this.callbacks.onDeviceDiscovered?.(device);
    });
    discovery.onDeviceLost((deviceId) => {
      this.callbacks.onDeviceLost?.(deviceId);
    });
  }

  private setupClientCallbacks(): void {
    if (!this.client) return;

    const discovery = this.client.getDiscovery();
    discovery.onDeviceDiscovered((device) => {
      this.callbacks.onDeviceDiscovered?.(device);
    });
    discovery.onDeviceLost((deviceId) => {
      this.callbacks.onDeviceLost?.(deviceId);
    });
  }

  private ensureServer(): void {
    if (!this.server) {
      throw new Error("Server mode is not enabled");
    }
  }

  private ensureClient(): void {
    if (!this.client) {
      throw new Error("Client mode is not enabled");
    }
  }
}

export function createPairingRuntime(
  localDevice: DeviceInfo,
  options?: PairingRuntimeOptions,
): PairingRuntime {
  return new PairingRuntime(localDevice, options);
}

export function generateDeviceId(): string {
  return `dev-${randomUUID()}`;
}

export function createLocalDeviceInfo(
  overrides: Partial<DeviceInfo> = {},
): DeviceInfo {
  return {
    deviceId: overrides.deviceId ?? generateDeviceId(),
    deviceName: overrides.deviceName ?? "Unknown Device",
    deviceType: overrides.deviceType ?? "unknown",
    osName: overrides.osName,
    osVersion: overrides.osVersion,
    appVersion: overrides.appVersion,
    capabilities: overrides.capabilities ?? [],
    metadata: overrides.metadata,
  };
}
