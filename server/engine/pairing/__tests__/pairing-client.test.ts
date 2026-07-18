import { describe, it, expect, beforeEach, vi } from "vitest";
import { PairingClient } from "../pairing-client.js";
import type { DeviceInfo, PairingMessage } from "../types.js";

const createTestDevice = (id: string): DeviceInfo => ({
  deviceId: id,
  deviceName: `Test Device ${id}`,
  deviceType: "test",
});

describe("PairingClient", () => {
  let client: PairingClient;
  let localDevice: DeviceInfo;

  beforeEach(() => {
    localDevice = createTestDevice("client-device");
    client = new PairingClient(localDevice);
  });

  describe("discoverDevices", () => {
    it("should return discovered devices", async () => {
      const devices = await client.discoverDevices(100);
      expect(Array.isArray(devices)).toBe(true);
    });
  });

  describe("connectWithCode", () => {
    it("should create a session when connecting with code", async () => {
      const mockConnection = {
        send: vi.fn(),
        close: vi.fn(),
      };

      const connectFn = vi.fn().mockResolvedValue(mockConnection);
      const session = await client.connectWithCode("ABCDEFGH", connectFn);

      expect(session).toBeDefined();
      expect(session.sessionId).toBeTruthy();
      expect(session.pairingMethod).toBe("manual-code");
      expect(connectFn).toHaveBeenCalled();
      expect(mockConnection.send).toHaveBeenCalled();

      const sentMessage = mockConnection.send.mock.calls[0][0];
      expect(sentMessage.type).toBe("hello");
    });

    it("should throw if already connecting", async () => {
      const mockConnection = {
        send: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
      };

      const connectFn = vi.fn().mockResolvedValue(mockConnection);
      await client.connectWithCode("ABCDEFGH", connectFn);

      await expect(
        client.connectWithCode("ABCDEFGH", connectFn),
      ).rejects.toThrow("Already connecting");
    });
  });

  describe("disconnect", () => {
    it("should disconnect cleanly", async () => {
      const mockConnection = {
        send: vi.fn(),
        close: vi.fn(),
      };

      const connectFn = vi.fn().mockResolvedValue(mockConnection);
      await client.connectWithCode("ABCDEFGH", connectFn);
      await client.disconnect();

      expect(mockConnection.close).toHaveBeenCalled();
      expect(client.getCurrentSession()).toBeUndefined();
    });

    it("should not throw if not connected", async () => {
      await client.disconnect();
    });
  });

  describe("getCurrentSession", () => {
    it("should return undefined when not connected", () => {
      expect(client.getCurrentSession()).toBeUndefined();
    });

    it("should return current session when connected", async () => {
      const mockConnection = {
        send: vi.fn(),
        close: vi.fn(),
      };

      const connectFn = vi.fn().mockResolvedValue(mockConnection);
      const session = await client.connectWithCode("ABCDEFGH", connectFn);

      const current = client.getCurrentSession();
      expect(current?.sessionId).toBe(session.sessionId);
    });
  });

  describe("getPairedDevices", () => {
    it("should return empty array initially", () => {
      expect(client.getPairedDevices()).toEqual([]);
    });
  });

  describe("removePairedDevice", () => {
    it("should return false for non-existent device", () => {
      expect(client.removePairedDevice("nonexistent")).toBe(false);
    });
  });

  describe("isPaired", () => {
    it("should return false initially", () => {
      expect(client.isPaired()).toBe(false);
    });
  });

  describe("getDiscovery", () => {
    it("should return discovery instance", () => {
      expect(client.getDiscovery()).toBeDefined();
    });
  });

  describe("getSessionManager", () => {
    it("should return session manager", () => {
      expect(client.getSessionManager()).toBeDefined();
    });
  });

  describe("getProtocol", () => {
    it("should return protocol instance", () => {
      expect(client.getProtocol()).toBeDefined();
    });
  });

  describe("getLocalDevice", () => {
    it("should return local device info", () => {
      expect(client.getLocalDevice().deviceId).toBe("client-device");
    });
  });

  describe("updateLocalDevice", () => {
    it("should update local device info", () => {
      client.updateLocalDevice({ deviceName: "Updated Client" });
      expect(client.getLocalDevice().deviceName).toBe("Updated Client");
    });
  });

  describe("clear", () => {
    it("should clear all client state", async () => {
      const mockConnection = {
        send: vi.fn(),
        close: vi.fn(),
      };

      const connectFn = vi.fn().mockResolvedValue(mockConnection);
      await client.connectWithCode("ABCDEFGH", connectFn);
      client.clear();

      expect(client.getCurrentSession()).toBeUndefined();
      expect(client.isPaired()).toBe(false);
    });
  });

  describe("handleMessage", () => {
    it("should handle pong message", async () => {
      const mockConnection = {
        send: vi.fn(),
        close: vi.fn(),
      };

      const connectFn = vi.fn().mockResolvedValue(mockConnection);
      await client.connectWithCode("ABCDEFGH", connectFn);

      const session = client.getCurrentSession()!;
      const pongMessage: PairingMessage = {
        type: "pong",
        sessionId: session.sessionId,
        timestamp: Date.now(),
      };

      await client.handleMessage(pongMessage);
      expect(client.getCurrentSession()).toBeDefined();
    });

    it("should handle error message", async () => {
      const mockConnection = {
        send: vi.fn(),
        close: vi.fn(),
      };

      const connectFn = vi.fn().mockResolvedValue(mockConnection);
      await client.connectWithCode("ABCDEFGH", connectFn);

      const session = client.getCurrentSession()!;
      const errorMessage: PairingMessage = {
        type: "error",
        sessionId: session.sessionId,
        payload: { error: "test error" },
        timestamp: Date.now(),
      };

      await client.handleMessage(errorMessage);

      const updated = client.getCurrentSession();
      expect(updated?.state).toBe("failed");
    });
  });
});
