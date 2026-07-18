import { logger } from "../../logger.js";
import type {
  DiscoveredDevice,
  DeviceId,
  DiscoveryOptions,
  DeviceInfo,
} from "./types.js";

const DEFAULT_SERVICE_TYPE = "_cross-wms-pairing._tcp";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_DISCOVERY_TTL_MS = 30000;

export type DiscoveryTransport = "tcp" | "udp" | "bluetooth" | "websocket";

export type DeviceDiscoveredHandler = (device: DiscoveredDevice) => void;
export type DeviceLostHandler = (deviceId: DeviceId) => void;

export interface DiscoveryProvider {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  discover(timeoutMs?: number): Promise<DiscoveredDevice[]>;
  onDeviceDiscovered(handler: DeviceDiscoveredHandler): () => void;
  onDeviceLost(handler: DeviceLostHandler): () => void;
}

export class PairingDiscovery {
  private providers = new Map<string, DiscoveryProvider>();
  private discoveredDevices = new Map<DeviceId, DiscoveredDevice>();
  private deviceDiscoveredHandlers = new Set<DeviceDiscoveredHandler>();
  private deviceLostHandlers = new Set<DeviceLostHandler>();
  private isRunning = false;
  private defaultServiceType: string;
  private defaultTimeoutMs: number;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: DiscoveryOptions = {}) {
    this.defaultServiceType = options.serviceType ?? DEFAULT_SERVICE_TYPE;
    this.defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  registerProvider(provider: DiscoveryProvider): void {
    this.providers.set(provider.name, provider);
    logger.debug(`[PairingDiscovery] Registered provider: ${provider.name}`);
  }

  unregisterProvider(name: string): boolean {
    const removed = this.providers.delete(name);
    if (removed) {
      logger.debug(`[PairingDiscovery] Unregistered provider: ${name}`);
    }
    return removed;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    logger.info("[PairingDiscovery] Starting discovery");

    const startPromises = Array.from(this.providers.values()).map(
      (provider) => provider.start(),
    );

    await Promise.all(startPromises);

    for (const provider of this.providers.values()) {
      provider.onDeviceDiscovered((device) => this.handleDeviceDiscovered(device));
      provider.onDeviceLost((deviceId) => this.handleDeviceLost(deviceId));
    }

    this.isRunning = true;
    this.startPruneTimer();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info("[PairingDiscovery] Stopping discovery");

    const stopPromises = Array.from(this.providers.values()).map(
      (provider) => provider.stop(),
    );

    await Promise.all(stopPromises);

    this.isRunning = false;
    this.stopPruneTimer();
  }

  async discover(timeoutMs?: number): Promise<DiscoveredDevice[]> {
    const timeout = timeoutMs ?? this.defaultTimeoutMs;

    if (!this.isRunning) {
      await this.start();
    }

    const discoverPromises = Array.from(this.providers.values()).map(
      (provider) => provider.discover(timeout),
    );

    const results = await Promise.all(discoverPromises);
    const allDevices = results.flat();

    for (const device of allDevices) {
      this.handleDeviceDiscovered(device);
    }

    return this.getDiscoveredDevices();
  }

  getDiscoveredDevices(): DiscoveredDevice[] {
    this.pruneExpired();
    return Array.from(this.discoveredDevices.values()).sort(
      (a, b) => (b.signalStrength ?? 0) - (a.signalStrength ?? 0),
    );
  }

  getDevice(deviceId: DeviceId): DiscoveredDevice | undefined {
    this.pruneExpired();
    return this.discoveredDevices.get(deviceId);
  }

  onDeviceDiscovered(handler: DeviceDiscoveredHandler): () => void {
    this.deviceDiscoveredHandlers.add(handler);
    return () => {
      this.deviceDiscoveredHandlers.delete(handler);
    };
  }

  onDeviceLost(handler: DeviceLostHandler): () => void {
    this.deviceLostHandlers.add(handler);
    return () => {
      this.deviceLostHandlers.delete(handler);
    };
  }

  addDiscoveredDevice(device: DiscoveredDevice): void {
    this.handleDeviceDiscovered(device);
  }

  removeDiscoveredDevice(deviceId: DeviceId): boolean {
    const exists = this.discoveredDevices.has(deviceId);
    if (exists) {
      this.handleDeviceLost(deviceId);
    }
    return exists;
  }

  clear(): void {
    this.discoveredDevices.clear();
  }

  getDeviceCount(): number {
    this.pruneExpired();
    return this.discoveredDevices.size;
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  generateDiscoveryPayload(deviceInfo: DeviceInfo, pairingCode?: string): string {
    const payload = {
      deviceId: deviceInfo.deviceId,
      deviceName: deviceInfo.deviceName,
      deviceType: deviceInfo.deviceType,
      service: this.defaultServiceType,
      pairingCode,
      capabilities: deviceInfo.capabilities,
      version: "1.0.0",
      timestamp: Date.now(),
    };

    return JSON.stringify(payload);
  }

  parseDiscoveryPayload(payload: string): DiscoveredDevice | null {
    try {
      const parsed = JSON.parse(payload);

      if (!parsed.deviceId || !parsed.deviceName) {
        return null;
      }

      return {
        deviceId: parsed.deviceId,
        deviceName: parsed.deviceName,
        address: parsed.address ?? "",
        transport: parsed.transport ?? "tcp",
        signalStrength: parsed.signalStrength,
        lastSeen: parsed.timestamp ?? Date.now(),
        serviceName: parsed.service,
        txtRecord: parsed.txtRecord,
      };
    } catch {
      return null;
    }
  }

  private handleDeviceDiscovered(device: DiscoveredDevice): void {
    const existing = this.discoveredDevices.get(device.deviceId);

    this.discoveredDevices.set(device.deviceId, {
      ...device,
      lastSeen: Date.now(),
    });

    if (!existing) {
      logger.debug(
        `[PairingDiscovery] New device discovered: ${device.deviceName} (${device.deviceId})`,
      );
      for (const handler of this.deviceDiscoveredHandlers) {
        try {
          handler(device);
        } catch (err) {
          logger.error(`[PairingDiscovery] Device discovered handler error: ${err}`);
        }
      }
    }
  }

  private handleDeviceLost(deviceId: DeviceId): void {
    const existing = this.discoveredDevices.get(deviceId);

    if (existing) {
      this.discoveredDevices.delete(deviceId);
      logger.debug(
        `[PairingDiscovery] Device lost: ${existing.deviceName} (${deviceId})`,
      );
      for (const handler of this.deviceLostHandlers) {
        try {
          handler(deviceId);
        } catch (err) {
          logger.error(`[PairingDiscovery] Device lost handler error: ${err}`);
        }
      }
    }
  }

  private pruneExpired(): void {
    const now = Date.now();
    const expired: DeviceId[] = [];

    for (const [deviceId, device] of this.discoveredDevices) {
      if (now - device.lastSeen > DEFAULT_DISCOVERY_TTL_MS) {
        expired.push(deviceId);
      }
    }

    for (const deviceId of expired) {
      this.handleDeviceLost(deviceId);
    }
  }

  private startPruneTimer(): void {
    this.pruneTimer = setInterval(() => {
      this.pruneExpired();
    }, 5000);
  }

  private stopPruneTimer(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }
}

export class ManualDiscoveryProvider implements DiscoveryProvider {
  readonly name = "manual";

  private deviceDiscoveredHandlers = new Set<DeviceDiscoveredHandler>();
  private deviceLostHandlers = new Set<DeviceLostHandler>();
  private devices: DiscoveredDevice[] = [];

  async start(): Promise<void> {
    // Manual discovery doesn't need to start anything
  }

  async stop(): Promise<void> {
    this.devices = [];
  }

  async discover(): Promise<DiscoveredDevice[]> {
    return this.devices.slice();
  }

  onDeviceDiscovered(handler: DeviceDiscoveredHandler): () => void {
    this.deviceDiscoveredHandlers.add(handler);
    return () => {
      this.deviceDiscoveredHandlers.delete(handler);
    };
  }

  onDeviceLost(handler: DeviceLostHandler): () => void {
    this.deviceLostHandlers.add(handler);
    return () => {
      this.deviceLostHandlers.delete(handler);
    };
  }

  addDevice(device: DiscoveredDevice): void {
    this.devices.push(device);
    for (const handler of this.deviceDiscoveredHandlers) {
      handler(device);
    }
  }
}

export const pairingDiscovery = new PairingDiscovery();
