import { describe, it, expect, beforeEach, vi } from "vitest";
import { PairingSessionManager } from "../pairing-session.js";
import { PairingProtocol } from "../pairing-protocol.js";
import type { DeviceInfo, PairingMessage } from "../types.js";

const createTestDevice = (id: string): DeviceInfo => ({
  deviceId: id,
  deviceName: `Test Device ${id}`,
  deviceType: "test",
});

describe("PairingProtocol", () => {
  let sessionManager: PairingSessionManager;
  let protocol: PairingProtocol;
  let localDevice: DeviceInfo;

  beforeEach(() => {
    localDevice = createTestDevice("local-device");
    sessionManager = new PairingSessionManager();
    protocol = new PairingProtocol(sessionManager);
  });

  describe("createHelloMessage", () => {
    it("should create a hello message", () => {
      const session = sessionManager.createInitiatorSession(localDevice, "manual-code");
      const message = protocol.createHelloMessage(session.sessionId);

      expect(message.type).toBe("hello");
      expect(message.sessionId).toBe(session.sessionId);
      expect(message.payload).toBeDefined();
      expect((message.payload as any).deviceInfo).toBeDefined();
    });

    it("should throw for non-existent session", () => {
      expect(() => protocol.createHelloMessage("nonexistent")).toThrow();
    });
  });

  describe("createHelloAckMessage", () => {
    it("should create a hello ack message", () => {
      const session = sessionManager.createResponderSession(localDevice, "manual-code");
      const message = protocol.createHelloAckMessage(session.sessionId);

      expect(message.type).toBe("hello-ack");
      expect(message.sessionId).toBe(session.sessionId);
    });
  });

  describe("createChallengeMessage", () => {
    it("should create a challenge message", () => {
      const session = sessionManager.createInitiatorSession(localDevice, "manual-code");
      const message = protocol.createChallengeMessage(session.sessionId);

      expect(message.type).toBe("challenge");
      expect((message.payload as any).challenge).toBeTruthy();
    });
  });

  describe("createChallengeResponseMessage", () => {
    it("should create a challenge response message", () => {
      const session = sessionManager.createResponderSession(localDevice, "manual-code");
      const message = protocol.createChallengeResponseMessage(
        session.sessionId,
        "challenge-data",
      );

      expect(message.type).toBe("challenge-response");
      expect((message.payload as any).signature).toBeTruthy();
      expect((message.payload as any).publicKey).toBeTruthy();
    });

    it("should throw for non-existent session", () => {
      expect(() =>
        protocol.createChallengeResponseMessage("nonexistent", "challenge"),
      ).toThrow();
    });
  });

  describe("createKeyExchangeMessage", () => {
    it("should create a key exchange message", () => {
      const session = sessionManager.createInitiatorSession(localDevice, "manual-code");
      const message = protocol.createKeyExchangeMessage(session.sessionId);

      expect(message.type).toBe("key-exchange");
      expect((message.payload as any).publicKey).toBeTruthy();
    });
  });

  describe("createKeyExchangeAckMessage", () => {
    it("should create a key exchange ack message", () => {
      const session = sessionManager.createResponderSession(localDevice, "manual-code");
      const message = protocol.createKeyExchangeAckMessage(session.sessionId);

      expect(message.type).toBe("key-exchange-ack");
      expect((message.payload as any).publicKey).toBeTruthy();
    });
  });

  describe("createDeviceInfoMessage", () => {
    it("should create a device info message", () => {
      const session = sessionManager.createInitiatorSession(localDevice, "manual-code");
      const message = protocol.createDeviceInfoMessage(session.sessionId);

      expect(message.type).toBe("device-info");
      expect((message.payload as any).deviceInfo).toBeDefined();
    });
  });

  describe("createPairingCompleteMessage", () => {
    it("should create a pairing complete message", () => {
      const message = protocol.createPairingCompleteMessage("session-1");
      expect(message.type).toBe("pairing-complete");
      expect(message.sessionId).toBe("session-1");
    });
  });

  describe("createErrorMessage", () => {
    it("should create an error message", () => {
      const message = protocol.createErrorMessage("session-1", "test error");
      expect(message.type).toBe("error");
      expect((message.payload as any).error).toBe("test error");
    });
  });

  describe("createPingMessage", () => {
    it("should create a ping message", () => {
      const message = protocol.createPingMessage("session-1");
      expect(message.type).toBe("ping");
    });
  });

  describe("createPongMessage", () => {
    it("should create a pong message", () => {
      const message = protocol.createPongMessage("session-1");
      expect(message.type).toBe("pong");
    });
  });

  describe("handleMessage - hello", () => {
    it("should handle hello message and return hello-ack", async () => {
      const responderSession = sessionManager.createResponderSession(
        localDevice,
        "manual-code",
      );

      const helloMessage: PairingMessage = {
        type: "hello",
        sessionId: responderSession.sessionId,
        payload: {
          deviceInfo: createTestDevice("initiator"),
          pairingMethod: "manual-code",
          protocolVersion: "1.0.0",
        },
        timestamp: Date.now(),
      };

      const response = await protocol.handleMessage(helloMessage, "responder");
      expect(response).toBeDefined();
      expect(response?.type).toBe("hello-ack");

      const session = sessionManager.getSession(responderSession.sessionId);
      expect(session?.state).toBe("connecting");
      expect(session?.remoteDevice).toBeDefined();
    });
  });

  describe("handleMessage - ping", () => {
    it("should respond to ping with pong", async () => {
      const session = sessionManager.createInitiatorSession(localDevice, "manual-code");

      const pingMessage: PairingMessage = {
        type: "ping",
        sessionId: session.sessionId,
        timestamp: Date.now(),
      };

      const response = await protocol.handleMessage(pingMessage, "initiator");
      expect(response).toBeDefined();
      expect(response?.type).toBe("pong");
    });
  });

  describe("handleMessage - error", () => {
    it("should handle error message", async () => {
      const session = sessionManager.createInitiatorSession(localDevice, "manual-code");

      const errorMessage: PairingMessage = {
        type: "error",
        sessionId: session.sessionId,
        payload: { error: "test error" },
        timestamp: Date.now(),
      };

      await protocol.handleMessage(errorMessage, "initiator");

      const updated = sessionManager.getSession(session.sessionId);
      expect(updated?.state).toBe("failed");
      expect(updated?.error).toBe("test error");
    });
  });

  describe("registerHandler", () => {
    it("should register a custom handler", async () => {
      const customHandler = vi.fn().mockReturnValue({
        type: "pong",
        timestamp: Date.now(),
      });

      protocol.registerHandler("ping", customHandler);

      const session = sessionManager.createInitiatorSession(localDevice, "manual-code");
      const message: PairingMessage = {
        type: "ping",
        sessionId: session.sessionId,
        timestamp: Date.now(),
      };

      await protocol.handleMessage(message, "initiator");
      expect(customHandler).toHaveBeenCalled();
    });
  });

  describe("getMaxRetries", () => {
    it("should return default max retries", () => {
      expect(protocol.getMaxRetries()).toBe(3);
    });
  });

  describe("getRetryDelayMs", () => {
    it("should return default retry delay", () => {
      expect(protocol.getRetryDelayMs()).toBe(1000);
    });
  });

  describe("getHandshakeTimeoutMs", () => {
    it("should return default handshake timeout", () => {
      expect(protocol.getHandshakeTimeoutMs()).toBe(30000);
    });
  });

  describe("getSessionManager", () => {
    it("should return the session manager", () => {
      expect(protocol.getSessionManager()).toBe(sessionManager);
    });
  });
});
