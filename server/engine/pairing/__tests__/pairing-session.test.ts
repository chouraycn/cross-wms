import { describe, it, expect, beforeEach, vi } from "vitest";
import { PairingSessionManager } from "../pairing-session.js";
import type { DeviceInfo, PairingSession } from "../types.js";

const createTestDevice = (id: string): DeviceInfo => ({
  deviceId: id,
  deviceName: `Test Device ${id}`,
  deviceType: "test",
});

describe("PairingSessionManager", () => {
  let manager: PairingSessionManager;
  let localDevice: DeviceInfo;

  beforeEach(() => {
    localDevice = createTestDevice("local-device");
    manager = new PairingSessionManager({ defaultTtlMs: 60000 });
  });

  describe("createInitiatorSession", () => {
    it("should create an initiator session", () => {
      const session = manager.createInitiatorSession(localDevice, "manual-code");
      expect(session).toBeDefined();
      expect(session.sessionId).toBeTruthy();
      expect(session.state).toBe("idle");
      expect(session.pairingMethod).toBe("manual-code");
      expect(session.localDevice.deviceId).toBe("local-device");
      expect(session.localDevice.publicKey).toBeTruthy();
    });

    it("should create sessions with unique IDs", () => {
      const session1 = manager.createInitiatorSession(localDevice, "manual-code");
      const session2 = manager.createInitiatorSession(localDevice, "manual-code");
      expect(session1.sessionId).not.toBe(session2.sessionId);
    });

    it("should include pairing code when provided", () => {
      const pairingCode = {
        code: "ABCDEFGH",
        expiresAt: Date.now() + 60000,
        createdAt: Date.now(),
        used: false,
      };
      const session = manager.createInitiatorSession(
        localDevice,
        "manual-code",
        pairingCode,
      );
      expect(session.pairingCode).toEqual(pairingCode);
    });
  });

  describe("createResponderSession", () => {
    it("should create a responder session with pairing code", () => {
      const session = manager.createResponderSession(localDevice, "manual-code");
      expect(session).toBeDefined();
      expect(session.sessionId).toBeTruthy();
      expect(session.state).toBe("idle");
      expect(session.pairingCode).toBeDefined();
      expect(session.pairingCode?.code).toBeTruthy();
      expect(session.pairingCode?.used).toBe(false);
    });
  });

  describe("getSession", () => {
    it("should return undefined for non-existent session", () => {
      expect(manager.getSession("nonexistent")).toBeUndefined();
    });

    it("should return the session for existing ID", () => {
      const created = manager.createInitiatorSession(localDevice, "manual-code");
      const found = manager.getSession(created.sessionId);
      expect(found?.sessionId).toBe(created.sessionId);
    });
  });

  describe("transitionState", () => {
    it("should transition to a valid state", () => {
      const session = manager.createInitiatorSession(localDevice, "manual-code");
      const updated = manager.transitionState(session.sessionId, "connecting");
      expect(updated?.state).toBe("connecting");
    });

    it("should return undefined for invalid transition", () => {
      const session = manager.createInitiatorSession(localDevice, "manual-code");
      const updated = manager.transitionState(session.sessionId, "paired");
      expect(updated).toBeUndefined();
    });

    it("should return undefined for non-existent session", () => {
      const updated = manager.transitionState("nonexistent", "connecting");
      expect(updated).toBeUndefined();
    });

    it("should set error message when provided", () => {
      const session = manager.createInitiatorSession(localDevice, "manual-code");
      const updated = manager.transitionState(
        session.sessionId,
        "failed",
        "test error",
      );
      expect(updated?.state).toBe("failed");
      expect(updated?.error).toBe("test error");
    });

    it("should notify state change handlers", () => {
      const handler = vi.fn();
      manager.onStateChange(handler);

      const session = manager.createInitiatorSession(localDevice, "manual-code");
      manager.transitionState(session.sessionId, "connecting");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][1]).toBe("idle");
      expect(handler.mock.calls[0][2]).toBe("connecting");
    });
  });

  describe("setRemoteDevice", () => {
    it("should set the remote device", () => {
      const session = manager.createInitiatorSession(localDevice, "manual-code");
      const remoteDevice = createTestDevice("remote-device");

      const updated = manager.setRemoteDevice(session.sessionId, remoteDevice);
      expect(updated?.remoteDevice).toEqual(remoteDevice);
    });

    it("should return undefined for non-existent session", () => {
      const result = manager.setRemoteDevice(
        "nonexistent",
        createTestDevice("remote"),
      );
      expect(result).toBeUndefined();
    });
  });

  describe("setSharedSecret", () => {
    it("should set the shared secret", () => {
      const session = manager.createInitiatorSession(localDevice, "manual-code");
      const updated = manager.setSharedSecret(session.sessionId, "secret123");
      expect(updated?.sharedSecret).toBe("secret123");
    });
  });

  describe("getKeyPair", () => {
    it("should return the key pair for a session", () => {
      const session = manager.createInitiatorSession(localDevice, "manual-code");
      const keyPair = manager.getKeyPair(session.sessionId);
      expect(keyPair).toBeDefined();
      expect(keyPair?.publicKey).toBeTruthy();
      expect(keyPair?.privateKey).toBeTruthy();
    });

    it("should return undefined for non-existent session", () => {
      expect(manager.getKeyPair("nonexistent")).toBeUndefined();
    });
  });

  describe("computeSharedSecret", () => {
    it("should compute shared secret from both sides", () => {
      const aliceDevice = createTestDevice("alice");
      const bobDevice = createTestDevice("bob");

      const aliceSession = manager.createInitiatorSession(aliceDevice, "manual-code");
      const bobSession = manager.createInitiatorSession(bobDevice, "manual-code");

      const aliceKeyPair = manager.getKeyPair(aliceSession.sessionId)!;
      const bobKeyPair = manager.getKeyPair(bobSession.sessionId)!;

      const aliceSecret = manager.computeSharedSecret(
        aliceSession.sessionId,
        bobKeyPair.publicKey,
      );
      const bobSecret = manager.computeSharedSecret(
        bobSession.sessionId,
        aliceKeyPair.publicKey,
      );

      expect(aliceSecret).toBeTruthy();
      expect(bobSecret).toBeTruthy();
      expect(aliceSecret).toBe(bobSecret);
    });

    it("should return undefined for non-existent session", () => {
      const result = manager.computeSharedSecret("nonexistent", "publicKey");
      expect(result).toBeUndefined();
    });
  });

  describe("completeSession", () => {
    it("should complete a session and add paired device", () => {
      const session = manager.createInitiatorSession(localDevice, "manual-code");
      const remoteDevice = createTestDevice("remote-device");
      manager.setRemoteDevice(session.sessionId, remoteDevice);
      manager.transitionState(session.sessionId, "connecting");
      manager.transitionState(session.sessionId, "authenticating");
      manager.transitionState(session.sessionId, "exchanging-keys");

      const pairedDevice = manager.completeSession(session.sessionId);
      expect(pairedDevice).toBeDefined();
      expect(pairedDevice?.deviceId).toBe("remote-device");
      expect(pairedDevice?.isActive).toBe(true);

      const device = manager.getPairedDevice("remote-device");
      expect(device).toBeDefined();
    });

    it("should return undefined if no remote device", () => {
      const session = manager.createInitiatorSession(localDevice, "manual-code");
      const result = manager.completeSession(session.sessionId);
      expect(result).toBeUndefined();
    });
  });

  describe("failSession", () => {
    it("should mark session as failed", () => {
      const session = manager.createInitiatorSession(localDevice, "manual-code");
      manager.transitionState(session.sessionId, "connecting");

      const result = manager.failSession(session.sessionId, "test error");
      expect(result).toBe(true);

      const updated = manager.getSession(session.sessionId);
      expect(updated?.state).toBe("failed");
      expect(updated?.error).toBe("test error");
    });

    it("should return false for non-existent session", () => {
      const result = manager.failSession("nonexistent", "error");
      expect(result).toBe(false);
    });
  });

  describe("removeSession", () => {
    it("should remove a session", () => {
      const session = manager.createInitiatorSession(localDevice, "manual-code");
      expect(manager.removeSession(session.sessionId)).toBe(true);
      expect(manager.getSession(session.sessionId)).toBeUndefined();
    });
  });

  describe("listSessions", () => {
    it("should list all sessions", () => {
      manager.createInitiatorSession(localDevice, "manual-code");
      manager.createInitiatorSession(localDevice, "manual-code");
      expect(manager.listSessions().length).toBe(2);
    });
  });

  describe("listPairedDevices", () => {
    it("should list all paired devices", () => {
      expect(manager.listPairedDevices().length).toBe(0);
    });
  });

  describe("removePairedDevice", () => {
    it("should remove a paired device", () => {
      const session = manager.createInitiatorSession(localDevice, "manual-code");
      const remoteDevice = createTestDevice("remote-device");
      manager.setRemoteDevice(session.sessionId, remoteDevice);
      manager.transitionState(session.sessionId, "connecting");
      manager.transitionState(session.sessionId, "authenticating");
      manager.transitionState(session.sessionId, "exchanging-keys");
      manager.completeSession(session.sessionId);

      expect(manager.removePairedDevice("remote-device")).toBe(true);
      expect(manager.getPairedDevice("remote-device")).toBeUndefined();
    });
  });

  describe("onStateChange", () => {
    it("should return unsubscribe function", () => {
      const handler = vi.fn();
      const unsubscribe = manager.onStateChange(handler);

      const session = manager.createInitiatorSession(localDevice, "manual-code");
      manager.transitionState(session.sessionId, "connecting");
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();
      manager.transitionState(session.sessionId, "authenticating");
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("clear", () => {
    it("should clear everything", () => {
      manager.createInitiatorSession(localDevice, "manual-code");
      manager.clear();
      expect(manager.listSessions().length).toBe(0);
      expect(manager.listPairedDevices().length).toBe(0);
    });
  });
});
