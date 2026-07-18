import { describe, it, expect, beforeEach } from "vitest";
import { PairingStore } from "../pairing-store.js";
import type { PairingSession, PairedDevice, DeviceInfo } from "../types.js";

const createTestDevice = (id: string): DeviceInfo => ({
  deviceId: id,
  deviceName: `Test Device ${id}`,
  deviceType: "test",
});

const createTestSession = (id: string, state: string = "idle"): PairingSession => ({
  sessionId: id,
  state: state as PairingSession["state"],
  localDevice: createTestDevice("local"),
  pairingMethod: "manual-code",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  expiresAt: Date.now() + 60000,
});

const createPairedDevice = (id: string): PairedDevice => ({
  deviceId: id,
  deviceInfo: createTestDevice(id),
  pairedAt: Date.now(),
  lastSeenAt: Date.now(),
  isActive: true,
  trustLevel: 1,
});

describe("PairingStore", () => {
  let store: PairingStore;

  beforeEach(() => {
    store = new PairingStore({ maxPendingPairings: 10 });
  });

  describe("createSession", () => {
    it("should create a new session", () => {
      const session = createTestSession("session-1");
      const result = store.createSession(session);
      expect(result).toEqual(session);
      expect(store.getSession("session-1")).toEqual(session);
    });

    it("should throw when max pending pairings reached", () => {
      const limitedStore = new PairingStore({ maxPendingPairings: 2 });
      limitedStore.createSession(createTestSession("s1"));
      limitedStore.createSession(createTestSession("s2"));
      expect(() => limitedStore.createSession(createTestSession("s3"))).toThrow(
        "Maximum pending pairings",
      );
    });

    it("should not count paired sessions against limit", () => {
      const limitedStore = new PairingStore({ maxPendingPairings: 2 });
      limitedStore.createSession(createTestSession("s1", "paired"));
      limitedStore.createSession(createTestSession("s2"));
      limitedStore.createSession(createTestSession("s3"));
      expect(limitedStore.getSessionCount()).toBe(3);
    });
  });

  describe("getSession", () => {
    it("should return undefined for non-existent session", () => {
      expect(store.getSession("nonexistent")).toBeUndefined();
    });

    it("should return the session for existing ID", () => {
      const session = createTestSession("session-1");
      store.createSession(session);
      expect(store.getSession("session-1")).toEqual(session);
    });
  });

  describe("updateSession", () => {
    it("should update session properties", () => {
      store.createSession(createTestSession("session-1"));
      const updated = store.updateSession("session-1", { state: "connecting" });
      expect(updated?.state).toBe("connecting");
      expect(updated?.updatedAt).toBeGreaterThan(Date.now() - 1000);
    });

    it("should return undefined for non-existent session", () => {
      const result = store.updateSession("nonexistent", { state: "connecting" });
      expect(result).toBeUndefined();
    });
  });

  describe("removeSession", () => {
    it("should remove an existing session", () => {
      store.createSession(createTestSession("session-1"));
      expect(store.removeSession("session-1")).toBe(true);
      expect(store.getSession("session-1")).toBeUndefined();
    });

    it("should return false for non-existent session", () => {
      expect(store.removeSession("nonexistent")).toBe(false);
    });
  });

  describe("listSessions", () => {
    it("should return all sessions sorted by createdAt desc", () => {
      const earlier = createTestSession("earlier");
      earlier.createdAt = Date.now() - 10000;
      const later = createTestSession("later");
      later.createdAt = Date.now();

      store.createSession(earlier);
      store.createSession(later);

      const sessions = store.listSessions();
      expect(sessions.length).toBe(2);
      expect(sessions[0].sessionId).toBe("later");
      expect(sessions[1].sessionId).toBe("earlier");
    });

    it("should return empty array when no sessions", () => {
      expect(store.listSessions()).toEqual([]);
    });
  });

  describe("findSessionByDevice", () => {
    it("should find session by remote device ID", () => {
      const session = createTestSession("session-1");
      session.remoteDevice = createTestDevice("remote-1");
      store.createSession(session);

      const found = store.findSessionByDevice("remote-1");
      expect(found?.sessionId).toBe("session-1");
    });

    it("should return undefined when no match", () => {
      const session = createTestSession("session-1");
      session.remoteDevice = createTestDevice("remote-1");
      store.createSession(session);

      expect(store.findSessionByDevice("nonexistent")).toBeUndefined();
    });
  });

  describe("addPairedDevice", () => {
    it("should add a paired device", () => {
      const device = createPairedDevice("device-1");
      store.addPairedDevice(device);
      expect(store.getPairedDevice("device-1")).toEqual(device);
    });
  });

  describe("getPairedDevice", () => {
    it("should return undefined for non-existent device", () => {
      expect(store.getPairedDevice("nonexistent")).toBeUndefined();
    });

    it("should return the device for existing ID", () => {
      const device = createPairedDevice("device-1");
      store.addPairedDevice(device);
      expect(store.getPairedDevice("device-1")).toEqual(device);
    });
  });

  describe("updatePairedDevice", () => {
    it("should update paired device properties", () => {
      store.addPairedDevice(createPairedDevice("device-1"));
      const updated = store.updatePairedDevice("device-1", { isActive: false });
      expect(updated?.isActive).toBe(false);
      expect(updated?.lastSeenAt).toBeGreaterThan(Date.now() - 1000);
    });

    it("should return undefined for non-existent device", () => {
      const result = store.updatePairedDevice("nonexistent", { isActive: false });
      expect(result).toBeUndefined();
    });
  });

  describe("removePairedDevice", () => {
    it("should remove an existing paired device", () => {
      store.addPairedDevice(createPairedDevice("device-1"));
      expect(store.removePairedDevice("device-1")).toBe(true);
      expect(store.getPairedDevice("device-1")).toBeUndefined();
    });

    it("should return false for non-existent device", () => {
      expect(store.removePairedDevice("nonexistent")).toBe(false);
    });
  });

  describe("listPairedDevices", () => {
    it("should return all paired devices sorted by pairedAt desc", () => {
      const earlier = createPairedDevice("earlier");
      earlier.pairedAt = Date.now() - 10000;
      const later = createPairedDevice("later");
      later.pairedAt = Date.now();

      store.addPairedDevice(earlier);
      store.addPairedDevice(later);

      const devices = store.listPairedDevices();
      expect(devices.length).toBe(2);
      expect(devices[0].deviceId).toBe("later");
      expect(devices[1].deviceId).toBe("earlier");
    });
  });

  describe("isDevicePaired", () => {
    it("should return true for active paired device", () => {
      store.addPairedDevice(createPairedDevice("device-1"));
      expect(store.isDevicePaired("device-1")).toBe(true);
    });

    it("should return false for inactive device", () => {
      const device = createPairedDevice("device-1");
      device.isActive = false;
      store.addPairedDevice(device);
      expect(store.isDevicePaired("device-1")).toBe(false);
    });

    it("should return false for non-existent device", () => {
      expect(store.isDevicePaired("nonexistent")).toBe(false);
    });
  });

  describe("markDeviceActive", () => {
    it("should mark device as active", () => {
      const device = createPairedDevice("device-1");
      device.isActive = false;
      store.addPairedDevice(device);

      expect(store.markDeviceActive("device-1")).toBe(true);
      expect(store.getPairedDevice("device-1")?.isActive).toBe(true);
    });

    it("should return false for non-existent device", () => {
      expect(store.markDeviceActive("nonexistent")).toBe(false);
    });
  });

  describe("markDeviceInactive", () => {
    it("should mark device as inactive", () => {
      store.addPairedDevice(createPairedDevice("device-1"));
      expect(store.markDeviceInactive("device-1")).toBe(true);
      expect(store.getPairedDevice("device-1")?.isActive).toBe(false);
    });

    it("should return false for non-existent device", () => {
      expect(store.markDeviceInactive("nonexistent")).toBe(false);
    });
  });

  describe("clearSessions", () => {
    it("should clear all sessions", () => {
      store.createSession(createTestSession("s1"));
      store.createSession(createTestSession("s2"));
      store.clearSessions();
      expect(store.getSessionCount()).toBe(0);
    });
  });

  describe("clearPairedDevices", () => {
    it("should clear all paired devices", () => {
      store.addPairedDevice(createPairedDevice("d1"));
      store.addPairedDevice(createPairedDevice("d2"));
      store.clearPairedDevices();
      expect(store.getPairedDeviceCount()).toBe(0);
    });
  });

  describe("clear", () => {
    it("should clear everything", () => {
      store.createSession(createTestSession("s1"));
      store.addPairedDevice(createPairedDevice("d1"));
      store.clear();
      expect(store.getSessionCount()).toBe(0);
      expect(store.getPairedDeviceCount()).toBe(0);
    });
  });

  describe("getSessionCount", () => {
    it("should return correct count", () => {
      expect(store.getSessionCount()).toBe(0);
      store.createSession(createTestSession("s1"));
      expect(store.getSessionCount()).toBe(1);
    });
  });

  describe("getPairedDeviceCount", () => {
    it("should return correct count", () => {
      expect(store.getPairedDeviceCount()).toBe(0);
      store.addPairedDevice(createPairedDevice("d1"));
      expect(store.getPairedDeviceCount()).toBe(1);
    });
  });

  describe("getTtlMs", () => {
    it("should return default TTL", () => {
      expect(store.getTtlMs()).toBe(30 * 60 * 1000);
    });
  });

  describe("getMaxPendingPairings", () => {
    it("should return max pending pairings", () => {
      expect(store.getMaxPendingPairings()).toBe(10);
    });
  });
});
