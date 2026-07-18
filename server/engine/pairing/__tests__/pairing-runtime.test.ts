import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PairingRuntime,
  createPairingRuntime,
  generateDeviceId,
  createLocalDeviceInfo,
} from "../pairing-runtime.js";
import type { DeviceInfo } from "../types.js";

const createTestDevice = (id: string): DeviceInfo => ({
  deviceId: id,
  deviceName: `Test Device ${id}`,
  deviceType: "test",
});

describe("PairingRuntime", () => {
  let runtime: PairingRuntime;
  let localDevice: DeviceInfo;

  beforeEach(() => {
    localDevice = createTestDevice("local-device");
    runtime = new PairingRuntime(localDevice, { mode: "both" });
  });

  describe("initialize", () => {
    it("should initialize in both mode", async () => {
      await runtime.initialize();
      expect(runtime.isActive()).toBe(true);
      expect(runtime.getServer()).toBeDefined();
      expect(runtime.getClient()).toBeDefined();
    });

    it("should initialize in server mode", async () => {
      const serverRuntime = new PairingRuntime(localDevice, { mode: "server" });
      await serverRuntime.initialize();
      expect(serverRuntime.getServer()).toBeDefined();
      expect(serverRuntime.getClient()).toBeUndefined();
      await serverRuntime.shutdown();
    });

    it("should initialize in client mode", async () => {
      const clientRuntime = new PairingRuntime(localDevice, { mode: "client" });
      await clientRuntime.initialize();
      expect(clientRuntime.getServer()).toBeUndefined();
      expect(clientRuntime.getClient()).toBeDefined();
      await clientRuntime.shutdown();
    });

    it("should not re-initialize if already initialized", async () => {
      await runtime.initialize();
      await runtime.initialize();
      expect(runtime.isActive()).toBe(true);
    });
  });

  describe("shutdown", () => {
    it("should shut down cleanly", async () => {
      await runtime.initialize();
      await runtime.shutdown();
      expect(runtime.isActive()).toBe(false);
    });

    it("should not throw if not initialized", async () => {
      await runtime.shutdown();
      expect(runtime.isActive()).toBe(false);
    });
  });

  describe("startPairing", () => {
    it("should start a pairing session", async () => {
      await runtime.initialize();
      const session = runtime.startPairing("manual-code");

      expect(session).toBeDefined();
      expect(session.sessionId).toBeTruthy();
      expect(session.pairingCode).toBeDefined();
      expect(session.pairingMethod).toBe("manual-code");
    });

    it("should throw if server mode is not enabled", async () => {
      const clientRuntime = new PairingRuntime(localDevice, { mode: "client" });
      await clientRuntime.initialize();

      expect(() => clientRuntime.startPairing()).toThrow("Server mode is not enabled");
      await clientRuntime.shutdown();
    });
  });

  describe("getSession", () => {
    it("should return session by ID", async () => {
      await runtime.initialize();
      const session = runtime.startPairing();
      const found = runtime.getSession(session.sessionId);
      expect(found?.sessionId).toBe(session.sessionId);
    });

    it("should return undefined for non-existent session", async () => {
      await runtime.initialize();
      expect(runtime.getSession("nonexistent")).toBeUndefined();
    });
  });

  describe("listSessions", () => {
    it("should list all sessions", async () => {
      await runtime.initialize();
      runtime.startPairing();
      runtime.startPairing();
      expect(runtime.listSessions().length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("listPairedDevices", () => {
    it("should return empty array initially", async () => {
      await runtime.initialize();
      expect(runtime.listPairedDevices()).toEqual([]);
    });
  });

  describe("isDevicePaired", () => {
    it("should return false for unknown device", async () => {
      await runtime.initialize();
      expect(runtime.isDevicePaired("unknown")).toBe(false);
    });
  });

  describe("generatePairingCode", () => {
    it("should generate a pairing code", () => {
      const code = runtime.generatePairingCode();
      expect(code).toBeTruthy();
      expect(code.length).toBe(8);
    });
  });

  describe("validatePairingCode", () => {
    it("should return false for invalid code", () => {
      expect(runtime.validatePairingCode("INVALID")).toBe(false);
    });

    it("should return true for generated code", () => {
      const code = runtime.generatePairingCode();
      expect(runtime.validatePairingCode(code)).toBe(true);
    });
  });

  describe("getCrypto", () => {
    it("should return the crypto instance", () => {
      expect(runtime.getCrypto()).toBeDefined();
    });
  });

  describe("getCodeGenerator", () => {
    it("should return the code generator", () => {
      expect(runtime.getCodeGenerator()).toBeDefined();
    });
  });

  describe("getLocalDevice", () => {
    it("should return the local device info", () => {
      expect(runtime.getLocalDevice().deviceId).toBe("local-device");
    });
  });

  describe("updateLocalDevice", () => {
    it("should update local device info", () => {
      runtime.updateLocalDevice({ deviceName: "Updated Name" });
      expect(runtime.getLocalDevice().deviceName).toBe("Updated Name");
    });
  });

  describe("getMode", () => {
    it("should return the runtime mode", () => {
      expect(runtime.getMode()).toBe("both");
    });
  });

  describe("setCallbacks", () => {
    it("should set callbacks", () => {
      const callbacks = {
        onSessionCreated: vi.fn(),
        onStateChange: vi.fn(),
      };
      runtime.setCallbacks(callbacks);
      expect(runtime).toBeDefined();
    });
  });
});

describe("createPairingRuntime", () => {
  it("should create a PairingRuntime instance", () => {
    const device = createTestDevice("test");
    const runtime = createPairingRuntime(device);
    expect(runtime).toBeInstanceOf(PairingRuntime);
  });
});

describe("generateDeviceId", () => {
  it("should generate a device ID", () => {
    const id = generateDeviceId();
    expect(id).toBeTruthy();
    expect(id.startsWith("dev-")).toBe(true);
  });

  it("should generate unique IDs", () => {
    const id1 = generateDeviceId();
    const id2 = generateDeviceId();
    expect(id1).not.toBe(id2);
  });
});

describe("createLocalDeviceInfo", () => {
  it("should create device info with defaults", () => {
    const device = createLocalDeviceInfo();
    expect(device.deviceId).toBeTruthy();
    expect(device.deviceName).toBe("Unknown Device");
    expect(device.deviceType).toBe("unknown");
    expect(Array.isArray(device.capabilities)).toBe(true);
  });

  it("should override defaults with provided values", () => {
    const device = createLocalDeviceInfo({
      deviceName: "My Device",
      deviceType: "mobile",
    });
    expect(device.deviceName).toBe("My Device");
    expect(device.deviceType).toBe("mobile");
  });

  it("should use provided device ID", () => {
    const device = createLocalDeviceInfo({ deviceId: "custom-id" });
    expect(device.deviceId).toBe("custom-id");
  });
});
