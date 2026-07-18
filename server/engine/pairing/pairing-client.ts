import { logger } from "../../logger.js";
import { PairingSessionManager } from "./pairing-session.js";
import { PairingProtocol } from "./pairing-protocol.js";
import { PairingDiscovery } from "./pairing-discovery.js";
import type {
  DeviceInfo,
  PairingSession,
  PairingMessage,
  PairedDevice,
  PairingClientOptions,
  PairingMethod,
  PairingSessionId,
  DiscoveredDevice,
} from "./types.js";

export type ClientConnectionHandler = () => Promise<{
  send: (message: PairingMessage) => Promise<void>;
  close: () => void;
}>;

export class PairingClient {
  private sessionManager: PairingSessionManager;
  private protocol: PairingProtocol;
  private discovery: PairingDiscovery;
  private localDevice: DeviceInfo;
  private connectTimeoutMs: number;
  private handshakeTimeoutMs: number;
  private connection?: { send: (message: PairingMessage) => Promise<void>; close: () => void };
  private currentSessionId?: PairingSessionId;
  private isConnecting = false;
  private onPaired = false;

  constructor(
    localDevice: DeviceInfo,
    options: PairingClientOptions = {},
  ) {
    this.localDevice = localDevice;
    this.sessionManager = new PairingSessionManager();
    this.protocol = new PairingProtocol(this.sessionManager);
    this.discovery = new PairingDiscovery();
    this.connectTimeoutMs = options.connectTimeoutMs ?? 10000;
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 30000;
  }

  async discoverDevices(timeoutMs?: number): Promise<DiscoveredDevice[]> {
    logger.info("[PairingClient] Discovering devices");
    return this.discovery.discover(timeoutMs);
  }

  async connectWithCode(
    pairingCode: string,
    connect: ClientConnectionHandler,
  ): Promise<PairingSession> {
    if (this.isConnecting) {
      throw new Error("Already connecting");
    }

    this.isConnecting = true;

    try {
      logger.info("[PairingClient] Connecting with code: " + pairingCode);

      const session = this.sessionManager.createInitiatorSession(
        this.localDevice,
        "manual-code",
      );

      this.currentSessionId = session.sessionId;
      this.sessionManager.transitionState(session.sessionId, "connecting");

      this.connection = await connect();

      const helloMessage = this.protocol.createHelloMessage(session.sessionId);
      await this.connection.send(helloMessage);

      this.sessionManager.transitionState(session.sessionId, "authenticating");

      return session;
    } catch (err) {
      this.isConnecting = false;
      throw err;
    }
  }

  async connectWithDevice(
    device: DiscoveredDevice,
    connect: ClientConnectionHandler,
  ): Promise<PairingSession> {
    if (this.isConnecting) {
      throw new Error("Already connecting");
    }

    this.isConnecting = true;

    try {
      logger.info("[PairingClient] Connecting to device: " + device.deviceName);

      const session = this.sessionManager.createInitiatorSession(
        this.localDevice,
        "network-discovery",
      );

      this.currentSessionId = session.sessionId;
      this.sessionManager.transitionState(session.sessionId, "connecting");

      this.connection = await connect();

      const helloMessage = this.protocol.createHelloMessage(session.sessionId);
      await this.connection.send(helloMessage);

      return session;
    } catch (err) {
      this.isConnecting = false;
      throw err;
    }
  }

  async handleMessage(message: PairingMessage): Promise<void> {
    if (!this.currentSessionId) {
      logger.warn("[PairingClient] No active session");
      return;
    }

    const response = await this.protocol.handleMessage(message, "initiator");

    if (response && this.connection) {
      await this.connection.send(response);
    }

    const session = this.sessionManager.getSession(this.currentSessionId);
    if (session?.state === "paired") {
      this.isConnecting = false;
      this.onPaired = true;
      logger.info("[PairingClient] Pairing completed successfully");
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      this.connection.close();
      this.connection = undefined;
    }

    if (this.currentSessionId) {
      this.sessionManager.removeSession(this.currentSessionId);
      this.currentSessionId = undefined;
    }

    this.isConnecting = false;
    this.onPaired = false;

    logger.info("[PairingClient] Disconnected");
  }

  getCurrentSession(): PairingSession | undefined {
    if (!this.currentSessionId) {
      return undefined;
    }
    return this.sessionManager.getSession(this.currentSessionId);
  }

  getPairedDevices(): PairedDevice[] {
    return this.sessionManager.listPairedDevices();
  }

  getPairedDevice(deviceId: string): PairedDevice | undefined {
    return this.sessionManager.getPairedDevice(deviceId);
  }

  removePairedDevice(deviceId: string): boolean {
    return this.sessionManager.removePairedDevice(deviceId);
  }

  isPaired(): boolean {
    return this.onPaired;
  }

  getDiscovery(): PairingDiscovery {
    return this.discovery;
  }

  getSessionManager(): PairingSessionManager {
    return this.sessionManager;
  }

  getProtocol(): PairingProtocol {
    return this.protocol;
  }

  getLocalDevice(): DeviceInfo {
    return this.localDevice;
  }

  updateLocalDevice(updates: Partial<DeviceInfo>): void {
    this.localDevice = { ...this.localDevice, ...updates };
  }

  clear(): void {
    this.connection = undefined;
    this.currentSessionId = undefined;
    this.isConnecting = false;
    this.onPaired = false;
    this.sessionManager.clear();
  }
}
