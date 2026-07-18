import { randomUUID } from "node:crypto";
import { logger } from "../../logger.js";
import { PairingStore } from "./pairing-store.js";
import { PairingCodeGenerator } from "./pairing-code.js";
import { PairingCrypto } from "./pairing-crypto.js";
import type {
  PairingSession,
  PairingSessionId,
  PairingState,
  DeviceInfo,
  PairingMethod,
  PairingCodeInfo,
  PairedDevice,
  KeyPair,
} from "./types.js";

export interface PairingSessionManagerOptions {
  defaultTtlMs?: number;
  maxPendingPairings?: number;
}

export type SessionStateChangeHandler = (
  session: PairingSession,
  oldState: PairingState,
  newState: PairingState,
) => void;

export class PairingSessionManager {
  private store: PairingStore;
  private codeGenerator: PairingCodeGenerator;
  private crypto: PairingCrypto;
  private keyPairs = new Map<PairingSessionId, KeyPair>();
  private stateChangeHandlers = new Set<SessionStateChangeHandler>();

  constructor(options: PairingSessionManagerOptions = {}) {
    this.store = new PairingStore({
      ttlMs: options.defaultTtlMs,
      maxPendingPairings: options.maxPendingPairings,
    });
    this.codeGenerator = new PairingCodeGenerator();
    this.crypto = new PairingCrypto();
  }

  createInitiatorSession(
    localDevice: DeviceInfo,
    pairingMethod: PairingMethod,
    pairingCode?: PairingCodeInfo,
  ): PairingSession {
    const sessionId = this.generateSessionId();
    const now = Date.now();

    const keyPair = this.crypto.generateKeyPair();
    this.keyPairs.set(sessionId, keyPair);

    const session: PairingSession = {
      sessionId,
      state: "idle",
      localDevice: {
        ...localDevice,
        publicKey: keyPair.publicKey,
      },
      pairingMethod,
      pairingCode,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 30 * 60 * 1000,
    };

    return this.store.createSession(session);
  }

  createResponderSession(
    localDevice: DeviceInfo,
    pairingMethod: PairingMethod,
  ): PairingSession {
    const sessionId = this.generateSessionId();
    const now = Date.now();

    const keyPair = this.crypto.generateKeyPair();
    this.keyPairs.set(sessionId, keyPair);

    const codeInfo = this.codeGenerator.generate(localDevice.deviceId);

    const session: PairingSession = {
      sessionId,
      state: "idle",
      localDevice: {
        ...localDevice,
        publicKey: keyPair.publicKey,
      },
      pairingMethod,
      pairingCode: codeInfo,
      createdAt: now,
      updatedAt: now,
      expiresAt: codeInfo.expiresAt,
    };

    return this.store.createSession(session);
  }

  getSession(sessionId: PairingSessionId): PairingSession | undefined {
    return this.store.getSession(sessionId);
  }

  transitionState(
    sessionId: PairingSessionId,
    newState: PairingState,
    error?: string,
  ): PairingSession | undefined {
    const session = this.store.getSession(sessionId);
    if (!session) {
      return undefined;
    }

    const oldState = session.state;

    if (!this.isValidStateTransition(oldState, newState)) {
      logger.warn(
        `[PairingSession] Invalid state transition: ${oldState} -> ${newState} for session ${sessionId}`,
      );
      return undefined;
    }

    const updates: Partial<PairingSession> = { state: newState };
    if (error) {
      updates.error = error;
    }

    const updated = this.store.updateSession(sessionId, updates);

    if (updated) {
      logger.debug(
        `[PairingSession] State transition: ${oldState} -> ${newState} for session ${sessionId}`,
      );
      this.notifyStateChangeHandlers(updated, oldState, newState);
    }

    return updated;
  }

  setRemoteDevice(
    sessionId: PairingSessionId,
    remoteDevice: DeviceInfo,
  ): PairingSession | undefined {
    return this.store.updateSession(sessionId, { remoteDevice });
  }

  setSharedSecret(
    sessionId: PairingSessionId,
    sharedSecret: string,
  ): PairingSession | undefined {
    return this.store.updateSession(sessionId, { sharedSecret });
  }

  getKeyPair(sessionId: PairingSessionId): KeyPair | undefined {
    return this.keyPairs.get(sessionId);
  }

  computeSharedSecret(
    sessionId: PairingSessionId,
    remotePublicKey: string,
  ): string | undefined {
    const keyPair = this.keyPairs.get(sessionId);
    if (!keyPair) {
      return undefined;
    }

    const sharedSecret = this.crypto.computeSharedSecret(
      keyPair.privateKey,
      remotePublicKey,
    );

    this.setSharedSecret(sessionId, sharedSecret);
    return sharedSecret;
  }

  completeSession(sessionId: PairingSessionId): PairedDevice | undefined {
    const session = this.store.getSession(sessionId);
    if (!session || !session.remoteDevice) {
      return undefined;
    }

    this.transitionState(sessionId, "paired");

    const pairedDevice: PairedDevice = {
      deviceId: session.remoteDevice.deviceId,
      deviceInfo: session.remoteDevice,
      pairedAt: Date.now(),
      lastSeenAt: Date.now(),
      isActive: true,
      trustLevel: 1,
      sharedSecret: session.sharedSecret,
      metadata: session.metadata,
    };

    this.store.addPairedDevice(pairedDevice);
    this.keyPairs.delete(sessionId);

    logger.info(
      `[PairingSession] Session ${sessionId} completed with device ${session.remoteDevice.deviceId}`,
    );

    return pairedDevice;
  }

  failSession(sessionId: PairingSessionId, error: string): boolean {
    const result = this.transitionState(sessionId, "failed", error);
    if (result) {
      this.keyPairs.delete(sessionId);
      logger.warn(`[PairingSession] Session ${sessionId} failed: ${error}`);
    }
    return !!result;
  }

  removeSession(sessionId: PairingSessionId): boolean {
    this.keyPairs.delete(sessionId);
    return this.store.removeSession(sessionId);
  }

  listSessions(): PairingSession[] {
    return this.store.listSessions();
  }

  listPairedDevices(): PairedDevice[] {
    return this.store.listPairedDevices();
  }

  getPairedDevice(deviceId: string): PairedDevice | undefined {
    return this.store.getPairedDevice(deviceId);
  }

  removePairedDevice(deviceId: string): boolean {
    return this.store.removePairedDevice(deviceId);
  }

  onStateChange(handler: SessionStateChangeHandler): () => void {
    this.stateChangeHandlers.add(handler);
    return () => {
      this.stateChangeHandlers.delete(handler);
    };
  }

  clear(): void {
    this.store.clear();
    this.keyPairs.clear();
    this.stateChangeHandlers.clear();
  }

  getStore(): PairingStore {
    return this.store;
  }

  getCodeGenerator(): PairingCodeGenerator {
    return this.codeGenerator;
  }

  getCrypto(): PairingCrypto {
    return this.crypto;
  }

  private generateSessionId(): PairingSessionId {
    return `pair-sess-${randomUUID()}`;
  }

  private isValidStateTransition(
    from: PairingState,
    to: PairingState,
  ): boolean {
    const validTransitions: Record<PairingState, PairingState[]> = {
      idle: ["discovering", "connecting", "failed"],
      discovering: ["connecting", "failed", "idle"],
      connecting: ["authenticating", "failed", "idle"],
      authenticating: ["exchanging-keys", "failed", "idle"],
      "exchanging-keys": ["paired", "failed", "idle"],
      paired: [],
      failed: ["idle"],
      expired: ["idle"],
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  private notifyStateChangeHandlers(
    session: PairingSession,
    oldState: PairingState,
    newState: PairingState,
  ): void {
    for (const handler of this.stateChangeHandlers) {
      try {
        handler(session, oldState, newState);
      } catch (err) {
        logger.error(`[PairingSession] State change handler error: ${err}`);
      }
    }
  }
}

export const pairingSessionManager = new PairingSessionManager();
