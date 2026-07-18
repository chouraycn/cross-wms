import { logger } from "../../logger.js";
import type {
  PairingSession,
  PairingSessionId,
  PairedDevice,
  DeviceId,
  PairingStoreOptions,
} from "./types.js";

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_PENDING = 10;

export class PairingStore {
  private sessions = new Map<PairingSessionId, PairingSession>();
  private pairedDevices = new Map<DeviceId, PairedDevice>();
  private ttlMs: number;
  private maxPendingPairings: number;

  constructor(options: PairingStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxPendingPairings = options.maxPendingPairings ?? DEFAULT_MAX_PENDING;
  }

  createSession(session: PairingSession): PairingSession {
    this.pruneExpiredSessions();

    const pendingCount = Array.from(this.sessions.values()).filter(
      (s) => s.state !== "paired" && s.state !== "failed" && s.state !== "expired",
    ).length;

    if (pendingCount >= this.maxPendingPairings) {
      throw new Error(
        `Maximum pending pairings (${this.maxPendingPairings}) reached`,
      );
    }

    this.sessions.set(session.sessionId, session);
    logger.debug(`[PairingStore] Created session ${session.sessionId}`);
    return session;
  }

  getSession(sessionId: PairingSessionId): PairingSession | undefined {
    this.pruneExpiredSessions();
    const session = this.sessions.get(sessionId);
    if (session && this.isSessionExpired(session)) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return session;
  }

  updateSession(
    sessionId: PairingSessionId,
    updates: Partial<PairingSession>,
  ): PairingSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    const updated: PairingSession = {
      ...session,
      ...updates,
      updatedAt: Date.now(),
    };

    this.sessions.set(sessionId, updated);
    logger.debug(`[PairingStore] Updated session ${sessionId}: ${updated.state}`);
    return updated;
  }

  removeSession(sessionId: PairingSessionId): boolean {
    logger.debug(`[PairingStore] Removing session ${sessionId}`);
    return this.sessions.delete(sessionId);
  }

  listSessions(): PairingSession[] {
    this.pruneExpiredSessions();
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }

  findSessionByDevice(deviceId: DeviceId): PairingSession | undefined {
    this.pruneExpiredSessions();
    return Array.from(this.sessions.values()).find(
      (s) => s.remoteDevice?.deviceId === deviceId,
    );
  }

  addPairedDevice(device: PairedDevice): void {
    this.pairedDevices.set(device.deviceId, device);
    logger.debug(`[PairingStore] Added paired device ${device.deviceId}`);
  }

  getPairedDevice(deviceId: DeviceId): PairedDevice | undefined {
    return this.pairedDevices.get(deviceId);
  }

  updatePairedDevice(
    deviceId: DeviceId,
    updates: Partial<PairedDevice>,
  ): PairedDevice | undefined {
    const device = this.pairedDevices.get(deviceId);
    if (!device) {
      return undefined;
    }

    const updated: PairedDevice = {
      ...device,
      ...updates,
      lastSeenAt: Date.now(),
    };

    this.pairedDevices.set(deviceId, updated);
    return updated;
  }

  removePairedDevice(deviceId: DeviceId): boolean {
    logger.debug(`[PairingStore] Removing paired device ${deviceId}`);
    return this.pairedDevices.delete(deviceId);
  }

  listPairedDevices(): PairedDevice[] {
    return Array.from(this.pairedDevices.values()).sort(
      (a, b) => b.pairedAt - a.pairedAt,
    );
  }

  isDevicePaired(deviceId: DeviceId): boolean {
    const device = this.pairedDevices.get(deviceId);
    return device?.isActive ?? false;
  }

  markDeviceActive(deviceId: DeviceId): boolean {
    const device = this.pairedDevices.get(deviceId);
    if (!device) {
      return false;
    }

    device.isActive = true;
    device.lastSeenAt = Date.now();
    return true;
  }

  markDeviceInactive(deviceId: DeviceId): boolean {
    const device = this.pairedDevices.get(deviceId);
    if (!device) {
      return false;
    }

    device.isActive = false;
    return true;
  }

  clearSessions(): void {
    this.sessions.clear();
    logger.debug("[PairingStore] Cleared all sessions");
  }

  clearPairedDevices(): void {
    this.pairedDevices.clear();
    logger.debug("[PairingStore] Cleared all paired devices");
  }

  clear(): void {
    this.clearSessions();
    this.clearPairedDevices();
  }

  getSessionCount(): number {
    this.pruneExpiredSessions();
    return this.sessions.size;
  }

  getPairedDeviceCount(): number {
    return this.pairedDevices.size;
  }

  private pruneExpiredSessions(): number {
    let count = 0;
    const now = Date.now();

    for (const [id, session] of this.sessions) {
      if (this.isSessionExpired(session)) {
        this.sessions.delete(id);
        if (session.state !== "expired" && session.state !== "paired") {
          session.state = "expired";
        }
        count++;
      }
    }

    if (count > 0) {
      logger.debug(`[PairingStore] Pruned ${count} expired sessions`);
    }

    return count;
  }

  private isSessionExpired(session: PairingSession): boolean {
    if (session.state === "paired") {
      return false;
    }

    if (session.expiresAt && Date.now() > session.expiresAt) {
      return true;
    }

    if (!session.expiresAt) {
      return Date.now() - session.createdAt > this.ttlMs;
    }

    return false;
  }

  getTtlMs(): number {
    return this.ttlMs;
  }

  getMaxPendingPairings(): number {
    return this.maxPendingPairings;
  }
}

export const pairingStore = new PairingStore();
