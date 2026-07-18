import { logger } from "../../logger.js";
import { PairingSessionManager } from "./pairing-session.js";
import { PairingProtocol } from "./pairing-protocol.js";
import { PairingDiscovery } from "./pairing-discovery.js";
import { PairingCodeGenerator } from "./pairing-code.js";
import type {
  DeviceInfo,
  PairingSession,
  PairingMessage,
  PairedDevice,
  PairingServerOptions,
  PairingMethod,
  PairingSessionId,
} from "./types.js";

export type PairingRequestHandler = (
  session: PairingSession,
) => Promise<boolean> | boolean;

export type PairingCompleteHandler = (
  device: PairedDevice,
  session: PairingSession,
) => void;

export interface PairingServerConnection {
  id: string;
  send: (message: PairingMessage) => Promise<void>;
  close: () => void;
}

export class PairingServer {
  private sessionManager: PairingSessionManager;
  private protocol: PairingProtocol;
  private discovery: PairingDiscovery;
  private codeGenerator: PairingCodeGenerator;
  private localDevice: DeviceInfo;
  private isRunning = false;
  private connections = new Map<string, PairingServerConnection>();
  private sessionToConnection = new Map<PairingSessionId, string>();
  private pairingRequestHandler?: PairingRequestHandler;
  private pairingCompleteHandler?: PairingCompleteHandler;

  constructor(
    localDevice: DeviceInfo,
    options: PairingServerOptions = {},
  ) {
    this.localDevice = localDevice;
    this.sessionManager = new PairingSessionManager({
      defaultTtlMs: options.ttlMs,
      maxPendingPairings: options.maxPendingPairings,
    });
    this.protocol = new PairingProtocol(this.sessionManager);
    this.discovery = new PairingDiscovery();
    this.codeGenerator = this.sessionManager.getCodeGenerator();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    logger.info("[PairingServer] Starting pairing server");

    this.sessionManager.onStateChange((session, oldState, newState) => {
      this.handleSessionStateChange(session, oldState, newState);
    });

    this.isRunning = true;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info("[PairingServer] Stopping pairing server");

    for (const connection of this.connections.values()) {
      connection.close();
    }
    this.connections.clear();
    this.sessionToConnection.clear();

    await this.discovery.stop();
    this.isRunning = false;
  }

  createPairingSession(
    pairingMethod: PairingMethod = "manual-code",
  ): PairingSession {
    const session = this.sessionManager.createResponderSession(
      this.localDevice,
      pairingMethod,
    );

    logger.info(
      `[PairingServer] Created pairing session ${session.sessionId} with code ${session.pairingCode?.code}`,
    );

    return session;
  }

  async handleConnection(connection: PairingServerConnection): Promise<void> {
    this.connections.set(connection.id, connection);
    logger.debug(`[PairingServer] Connection established: ${connection.id}`);
  }

  async handleMessage(
    connectionId: string,
    message: PairingMessage,
  ): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn(`[PairingServer] Unknown connection: ${connectionId}`);
      return;
    }

    if (message.sessionId) {
      this.sessionToConnection.set(message.sessionId, connectionId);
    }

    const response = await this.protocol.handleMessage(message, "responder");

    if (response) {
      await connection.send(response);
    }
  }

  async closeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.close();
      this.connections.delete(connectionId);
    }

    for (const [sessionId, connId] of this.sessionToConnection) {
      if (connId === connectionId) {
        this.sessionToConnection.delete(sessionId);
      }
    }

    logger.debug(`[PairingServer] Connection closed: ${connectionId}`);
  }

  getSession(sessionId: PairingSessionId): PairingSession | undefined {
    return this.sessionManager.getSession(sessionId);
  }

  listSessions(): PairingSession[] {
    return this.sessionManager.listSessions();
  }

  listPairedDevices(): PairedDevice[] {
    return this.sessionManager.listPairedDevices();
  }

  getPairedDevice(deviceId: string): PairedDevice | undefined {
    return this.sessionManager.getPairedDevice(deviceId);
  }

  removePairedDevice(deviceId: string): boolean {
    return this.sessionManager.removePairedDevice(deviceId);
  }

  revokePairingCode(code: string): boolean {
    return this.codeGenerator.revoke(code);
  }

  validatePairingCode(code: string): boolean {
    return this.codeGenerator.validate(code);
  }

  onPairingRequest(handler: PairingRequestHandler): void {
    this.pairingRequestHandler = handler;
  }

  onPairingComplete(handler: PairingCompleteHandler): void {
    this.pairingCompleteHandler = handler;
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

  getCodeGenerator(): PairingCodeGenerator {
    return this.codeGenerator;
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getLocalDevice(): DeviceInfo {
    return this.localDevice;
  }

  updateLocalDevice(updates: Partial<DeviceInfo>): void {
    this.localDevice = { ...this.localDevice, ...updates };
  }

  private handleSessionStateChange(
    session: PairingSession,
    _oldState: string,
    newState: string,
  ): void {
    if (newState === "paired" && this.pairingCompleteHandler) {
      const device = this.sessionManager.getPairedDevice(
        session.remoteDevice?.deviceId ?? "",
      );
      if (device) {
        this.pairingCompleteHandler(device, session);
      }
    }
  }

  async sendToSession(
    sessionId: PairingSessionId,
    message: PairingMessage,
  ): Promise<boolean> {
    const connectionId = this.sessionToConnection.get(sessionId);
    if (!connectionId) {
      return false;
    }

    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    await connection.send(message);
    return true;
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  clear(): void {
    this.connections.clear();
    this.sessionToConnection.clear();
    this.sessionManager.clear();
  }
}
