import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  registerAcpRuntimeBackend,
  unregisterAcpRuntimeBackend,
  getAcpRuntimeBackend,
  requireAcpRuntimeBackend,
  AcpRuntimeError,
  __testing,
} from "../runtimeRegistry.js";

const testBackend = {
  id: "test-backend",
  runtime: {
    startSession: async () => {},
    stopSession: async () => {},
  },
  healthy: () => true,
};

describe("RuntimeRegistry", () => {
  beforeEach(() => {
    __testing.resetAcpRuntimeBackendsForTests();
  });

  afterEach(() => {
    __testing.resetAcpRuntimeBackendsForTests();
  });

  describe("registerAcpRuntimeBackend", () => {
    it("should register a backend", () => {
      registerAcpRuntimeBackend(testBackend);
      expect(getAcpRuntimeBackend("test-backend")).not.toBeNull();
    });

    it("should normalize backend id to lowercase", () => {
      registerAcpRuntimeBackend({ ...testBackend, id: "TEST-BACKEND" });
      expect(getAcpRuntimeBackend("test-backend")).not.toBeNull();
    });

    it("should throw error for missing id", () => {
      expect(() => registerAcpRuntimeBackend({ ...testBackend, id: "" } as any)).toThrow();
    });

    it("should throw error for missing runtime", () => {
      expect(() => registerAcpRuntimeBackend({ id: "test", runtime: undefined as any })).toThrow();
    });
  });

  describe("unregisterAcpRuntimeBackend", () => {
    it("should unregister a backend", () => {
      registerAcpRuntimeBackend(testBackend);
      unregisterAcpRuntimeBackend("test-backend");
      expect(getAcpRuntimeBackend("test-backend")).toBeNull();
    });

    it("should handle empty id", () => {
      expect(() => unregisterAcpRuntimeBackend("")).not.toThrow();
    });
  });

  describe("getAcpRuntimeBackend", () => {
    it("should return backend by id", () => {
      registerAcpRuntimeBackend(testBackend);
      const result = getAcpRuntimeBackend("test-backend");
      expect(result?.id).toBe("test-backend");
    });

    it("should return first healthy backend when no id provided", () => {
      registerAcpRuntimeBackend(testBackend);
      const result = getAcpRuntimeBackend();
      expect(result?.id).toBe("test-backend");
    });

    it("should return null when no backends registered", () => {
      expect(getAcpRuntimeBackend()).toBeNull();
    });

    it("should return any backend when all are unhealthy", () => {
      registerAcpRuntimeBackend({ ...testBackend, healthy: () => false });
      const result = getAcpRuntimeBackend();
      expect(result?.id).toBe("test-backend");
    });
  });

  describe("requireAcpRuntimeBackend", () => {
    it("should return backend when available", () => {
      registerAcpRuntimeBackend(testBackend);
      const result = requireAcpRuntimeBackend("test-backend");
      expect(result.id).toBe("test-backend");
    });

    it("should throw error when no backend found", () => {
      expect(() => requireAcpRuntimeBackend("nonexistent")).toThrow(AcpRuntimeError);
    });

    it("should throw error when backend is unhealthy", () => {
      registerAcpRuntimeBackend({ ...testBackend, healthy: () => false });
      expect(() => requireAcpRuntimeBackend("test-backend")).toThrow(AcpRuntimeError);
    });

    it("should throw error when requested id does not match", () => {
      registerAcpRuntimeBackend(testBackend);
      expect(() => requireAcpRuntimeBackend("other-backend")).toThrow(AcpRuntimeError);
    });
  });

  describe("AcpRuntimeError", () => {
    it("should have code and message", () => {
      const error = new AcpRuntimeError("TEST_CODE", "test message");
      expect(error.code).toBe("TEST_CODE");
      expect(error.message).toBe("test message");
      expect(error.name).toBe("AcpRuntimeError");
    });
  });
});