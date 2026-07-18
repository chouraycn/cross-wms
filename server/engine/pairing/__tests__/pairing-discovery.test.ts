import { describe, it, expect, beforeEach, vi } from "vitest";
import { PairingDiscovery, ManualDiscoveryProvider } from "../pairing-discovery.js";
import type { DiscoveredDevice, DeviceInfo } from "../types.js";

const createTestDevice = (id: string): DeviceInfo => ({
  deviceId: id,
  deviceName: `Test Device ${id}`,
  deviceType: "test",
});

const createDiscoveredDevice = (id: string): DiscoveredDevice => ({
  deviceId: id,
  deviceName: `Discovered ${id}`,
  address: `192.168.1.${id}`,
  transport: "tcp",
  lastSeen: Date.now(),
  signalStrength: -50,
});

describe("PairingDiscovery", () => {
  let discovery: PairingDiscovery;

  beforeEach(() => {
    discovery = new PairingDiscovery({ timeoutMs: 1000 });
  });

  describe("registerProvider", () => {
    it("should register a discovery provider", () => {
      const provider = new ManualDiscoveryProvider();
      discovery.registerProvider(provider);
      expect(discovery.getProviders()).toContain("manual");
    });
  });

  describe("unregisterProvider", () => {
    it("should unregister a provider", () => {
      const provider = new ManualDiscoveryProvider();
      discovery.registerProvider(provider);
      expect(discovery.unregisterProvider("manual")).toBe(true);
      expect(discovery.getProviders()).not.toContain("manual");
    });

    it("should return false for non-existent provider", () => {
      expect(discovery.unregisterProvider("nonexistent")).toBe(false);
    });
  });

  describe("start and stop", () => {
    it("should start discovery", async () => {
      const provider = new ManualDiscoveryProvider();
      discovery.registerProvider(provider);
      await discovery.start();
      expect(discovery.isActive()).toBe(true);
    });

    it("should stop discovery", async () => {
      const provider = new ManualDiscoveryProvider();
      discovery.registerProvider(provider);
      await discovery.start();
      await discovery.stop();
      expect(discovery.isActive()).toBe(false);
    });

    it("should not throw when starting twice", async () => {
      const provider = new ManualDiscoveryProvider();
      discovery.registerProvider(provider);
      await discovery.start();
      await discovery.start();
      expect(discovery.isActive()).toBe(true);
    });
  });

  describe("discover", () => {
    it("should discover devices from providers", async () => {
      const provider = new ManualDiscoveryProvider();
      discovery.registerProvider(provider);

      const testDevice = createDiscoveredDevice("device-1");
      provider.addDevice(testDevice);

      const devices = await discovery.discover(100);
      expect(devices.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getDiscoveredDevices", () => {
    it("should return all discovered devices", () => {
      discovery.addDiscoveredDevice(createDiscoveredDevice("d1"));
      discovery.addDiscoveredDevice(createDiscoveredDevice("d2"));
      expect(discovery.getDiscoveredDevices().length).toBe(2);
    });

    it("should return devices sorted by signal strength", () => {
      const weakDevice = createDiscoveredDevice("weak");
      weakDevice.signalStrength = -80;
      const strongDevice = createDiscoveredDevice("strong");
      strongDevice.signalStrength = -30;

      discovery.addDiscoveredDevice(weakDevice);
      discovery.addDiscoveredDevice(strongDevice);

      const devices = discovery.getDiscoveredDevices();
      expect(devices[0].deviceId).toBe("strong");
    });
  });

  describe("getDevice", () => {
    it("should return device by ID", () => {
      const device = createDiscoveredDevice("d1");
      discovery.addDiscoveredDevice(device);
      expect(discovery.getDevice("d1")).toBeDefined();
    });

    it("should return undefined for non-existent device", () => {
      expect(discovery.getDevice("nonexistent")).toBeUndefined();
    });
  });

  describe("onDeviceDiscovered", () => {
    it("should call handler when device is discovered", () => {
      const handler = vi.fn();
      discovery.onDeviceDiscovered(handler);

      const device = createDiscoveredDevice("d1");
      discovery.addDiscoveredDevice(device);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].deviceId).toBe("d1");
    });

    it("should not call handler for re-discovered devices", () => {
      const handler = vi.fn();
      discovery.onDeviceDiscovered(handler);

      const device = createDiscoveredDevice("d1");
      discovery.addDiscoveredDevice(device);
      discovery.addDiscoveredDevice(device);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("onDeviceLost", () => {
    it("should call handler when device is lost", () => {
      const handler = vi.fn();
      discovery.onDeviceLost(handler);

      const device = createDiscoveredDevice("d1");
      discovery.addDiscoveredDevice(device);
      discovery.removeDiscoveredDevice("d1");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toBe("d1");
    });
  });

  describe("addDiscoveredDevice", () => {
    it("should add a discovered device", () => {
      const device = createDiscoveredDevice("d1");
      discovery.addDiscoveredDevice(device);
      expect(discovery.getDeviceCount()).toBe(1);
    });

    it("should update lastSeen for existing device", () => {
      const device = createDiscoveredDevice("d1");
      device.lastSeen = Date.now() - 10000;

      discovery.addDiscoveredDevice(device);
      const originalDevice = discovery.getDevice("d1")!;

      const beforeUpdate = Date.now();
      discovery.addDiscoveredDevice(device);
      const afterUpdate = Date.now();
      const updatedDevice = discovery.getDevice("d1")!;

      expect(updatedDevice.lastSeen).toBeGreaterThanOrEqual(beforeUpdate);
      expect(updatedDevice.lastSeen).toBeLessThanOrEqual(afterUpdate);
    });
  });

  describe("removeDiscoveredDevice", () => {
    it("should remove a discovered device", () => {
      discovery.addDiscoveredDevice(createDiscoveredDevice("d1"));
      expect(discovery.removeDiscoveredDevice("d1")).toBe(true);
      expect(discovery.getDeviceCount()).toBe(0);
    });

    it("should return false for non-existent device", () => {
      expect(discovery.removeDiscoveredDevice("nonexistent")).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear all discovered devices", () => {
      discovery.addDiscoveredDevice(createDiscoveredDevice("d1"));
      discovery.addDiscoveredDevice(createDiscoveredDevice("d2"));
      discovery.clear();
      expect(discovery.getDeviceCount()).toBe(0);
    });
  });

  describe("getDeviceCount", () => {
    it("should return correct count", () => {
      expect(discovery.getDeviceCount()).toBe(0);
      discovery.addDiscoveredDevice(createDiscoveredDevice("d1"));
      expect(discovery.getDeviceCount()).toBe(1);
    });
  });

  describe("isActive", () => {
    it("should return false initially", () => {
      expect(discovery.isActive()).toBe(false);
    });
  });

  describe("getProviders", () => {
    it("should return empty array initially", () => {
      expect(discovery.getProviders()).toEqual([]);
    });
  });

  describe("generateDiscoveryPayload", () => {
    it("should generate a valid JSON payload", () => {
      const deviceInfo = createTestDevice("d1");
      const payload = discovery.generateDiscoveryPayload(deviceInfo, "ABCDEFGH");
      const parsed = JSON.parse(payload);

      expect(parsed.deviceId).toBe("d1");
      expect(parsed.pairingCode).toBe("ABCDEFGH");
      expect(parsed.timestamp).toBeTruthy();
    });
  });

  describe("parseDiscoveryPayload", () => {
    it("should parse a valid payload", () => {
      const deviceInfo = createTestDevice("d1");
      const payload = discovery.generateDiscoveryPayload(deviceInfo);
      const parsed = discovery.parseDiscoveryPayload(payload);

      expect(parsed).toBeTruthy();
      expect(parsed?.deviceId).toBe("d1");
    });

    it("should return null for invalid JSON", () => {
      const result = discovery.parseDiscoveryPayload("not json");
      expect(result).toBeNull();
    });

    it("should return null for missing required fields", () => {
      const result = discovery.parseDiscoveryPayload(JSON.stringify({ foo: "bar" }));
      expect(result).toBeNull();
    });
  });
});

describe("ManualDiscoveryProvider", () => {
  let provider: ManualDiscoveryProvider;

  beforeEach(() => {
    provider = new ManualDiscoveryProvider();
  });

  it("should have name 'manual'", () => {
    expect(provider.name).toBe("manual");
  });

  it("should start and stop without errors", async () => {
    await provider.start();
    await provider.stop();
  });

  it("should discover added devices", async () => {
    const device = createDiscoveredDevice("d1");
    provider.addDevice(device);

    const devices = await provider.discover();
    expect(devices.length).toBe(1);
    expect(devices[0].deviceId).toBe("d1");
  });

  it("should call onDeviceDiscovered handler", () => {
    const handler = vi.fn();
    provider.onDeviceDiscovered(handler);

    const device = createDiscoveredDevice("d1");
    provider.addDevice(device);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
