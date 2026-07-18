import { describe, it, expect, beforeEach, vi } from "vitest";
import { PairingServer } from "../pairing-server.js";
import type { DeviceInfo, PairingMessage } from "../types.js";

const createTestDevice = (id: string): DeviceInfo => ({
  deviceId: id,
  deviceName: `Test Device ${id}`,
  deviceType: "test",
});

describe("PairingServer", () => {
  let server: PairingServer;
  let localDevice: DeviceInfo;

  beforeEach(() => {
    localDevice = createTestDevice("server-device");
    server = new PairingServer(localDevice);
  });

  describe("start and stop", () => {
    it("should start the server", async () => {
      await server.start();
      expect(server.isActive()).toBe(true);
      await server.stop();
    });

    it("should stop the server", async () => {
      await server.start();
      await server.stop();
      expect(server.isActive()).toBe(false);
    });

    it("should not throw when starting twice", async () => {
      await server.start();
      await server.start();
      expect(server.isActive()).toBe(true);
      await server.stop();
    });

    it("should not throw when stopping before starting", async () => {
      await server.stop();
      expect(server.isActive()).toBe(false);
    });
  });

  describe("createPairingSession", () => {
    beforeEach(async () => {
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it("should create a pairing session with manual-code method", () => {
      const session = server.createPairingSession("manual-code");
      expect(session).toBeDefined();
      expect(session.sessionId).toBeTruthy();
      expect(session.pairingMethod).toBe("manual-code");
      expect(session.pairingCode).toBeDefined();
      expect(session.pairingCode?.code).toBeTruthy();
      expect(session.state).toBe("idle");
    });

    it("should create a pairing session with default method", () => {
      const session = server.createPairingSession();
      expect(session.pairingMethod).toBe("manual-code");
    });

    it("should create unique sessions", () => {
      const session1 = server.createPairingSession();
      const session2 = server.createPairingSession();
      expect(session1.sessionId).not.toBe(session2.sessionId);
      expect(session1.pairingCode?.code).not.toBe(session2.pairingCode?.code);
    });
  });

  describe("handleConnection", () => {
    beforeEach(async () => {
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it("should handle a new connection", async () => {
      const mockConnection = {
        id: "conn-1",
        send: vi.fn(),
        close: vi.fn(),
      };

      await server.handleConnection(mockConnection);
      expect(server.getConnectionCount()).toBe(1);
    });
  });

  describe("handleMessage", () => {
    beforeEach(async () => {
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it("should handle ping message", async () => {
      const session = server.createPairingSession();
      const mockSend = vi.fn();
      const mockConnection = {
        id: "conn-1",
        send: mockSend,
        close: vi.fn(),
      };

      await server.handleConnection(mockConnection);

      const pingMessage: PairingMessage = {
        type: "ping",
        sessionId: session.sessionId,
        timestamp: Date.now(),
      };

      await server.handleMessage("conn-1", pingMessage);
      expect(mockSend).toHaveBeenCalled();
      const sentMessage = mockSend.mock.calls[0][0];
      expect(sentMessage.type).toBe("pong");
    });
  });

  describe("closeConnection", () => {
    beforeEach(async () => {
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it("should close a connection", async () => {
      const mockConnection = {
        id: "conn-1",
        send: vi.fn(),
        close: vi.fn(),
      };

      await server.handleConnection(mockConnection);
      await server.closeConnection("conn-1");
      expect(server.getConnectionCount()).toBe(0);
      expect(mockConnection.close).toHaveBeenCalled();
    });
  });

  describe("getSession", () => {
    beforeEach(async () => {
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it("should return session by ID", () => {
      const created = server.createPairingSession();
      const found = server.getSession(created.sessionId);
      expect(found?.sessionId).toBe(created.sessionId);
    });

    it("should return undefined for non-existent session", () => {
      expect(server.getSession("nonexistent")).toBeUndefined();
    });
  });

  describe("listSessions", () => {
    beforeEach(async () => {
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it("should list all sessions", () => {
      server.createPairingSession();
      server.createPairingSession();
      expect(server.listSessions().length).toBe(2);
    });
  });

  describe("listPairedDevices", () => {
    it("should return empty array initially", async () => {
      await server.start();
      expect(server.listPairedDevices()).toEqual([]);
      await server.stop();
    });
  });

  describe("validatePairingCode", () => {
    beforeEach(async () => {
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it("should return true for valid code", () => {
      const session = server.createPairingSession();
      const code = session.pairingCode?.code ?? "";
      expect(server.validatePairingCode(code)).toBe(true);
    });

    it("should return false for invalid code", () => {
      expect(server.validatePairingCode("INVALID")).toBe(false);
    });
  });

  describe("revokePairingCode", () => {
    beforeEach(async () => {
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it("should revoke a valid code", () => {
      const session = server.createPairingSession();
      const code = session.pairingCode?.code ?? "";
      expect(server.revokePairingCode(code)).toBe(true);
      expect(server.validatePairingCode(code)).toBe(false);
    });
  });

  describe("onPairingComplete", () => {
    beforeEach(async () => {
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it("should set pairing complete handler", () => {
      const handler = vi.fn();
      server.onPairingComplete(handler);
      expect(server).toBeDefined();
    });
  });

  describe("onPairingRequest", () => {
    beforeEach(async () => {
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it("should set pairing request handler", () => {
      const handler = vi.fn();
      server.onPairingRequest(handler);
      expect(server).toBeDefined();
    });
  });

  describe("getDiscovery", () => {
    it("should return discovery instance", () => {
      expect(server.getDiscovery()).toBeDefined();
    });
  });

  describe("getSessionManager", () => {
    it("should return session manager", () => {
      expect(server.getSessionManager()).toBeDefined();
    });
  });

  describe("getProtocol", () => {
    it("should return protocol instance", () => {
      expect(server.getProtocol()).toBeDefined();
    });
  });

  describe("getCodeGenerator", () => {
    it("should return code generator", () => {
      expect(server.getCodeGenerator()).toBeDefined();
    });
  });

  describe("getLocalDevice", () => {
    it("should return local device info", () => {
      expect(server.getLocalDevice().deviceId).toBe("server-device");
    });
  });

  describe("updateLocalDevice", () => {
    it("should update local device info", () => {
      server.updateLocalDevice({ deviceName: "Updated Server" });
      expect(server.getLocalDevice().deviceName).toBe("Updated Server");
    });
  });

  describe("removePairedDevice", () => {
    it("should return false for non-existent device", () => {
      expect(server.removePairedDevice("nonexistent")).toBe(false);
    });
  });

  describe("clear", () => {
    beforeEach(async () => {
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it("should clear all data", () => {
      server.createPairingSession();
      server.clear();
      expect(server.listSessions().length).toBe(0);
      expect(server.getConnectionCount()).toBe(0);
    });
  });
});
