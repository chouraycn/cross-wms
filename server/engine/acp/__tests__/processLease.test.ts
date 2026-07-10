import { describe, it, expect } from "vitest";
import {
  createAcpxProcessLeaseStore,
  createAcpxProcessLeaseId,
  hashAcpxProcessCommand,
  withAcpxLeaseEnvironment,
  normalizeAcpxProcessLease,
  normalizeAcpxProcessLeaseFile,
} from "../processLease.js";

describe("ProcessLease", () => {
  describe("createAcpxProcessLeaseId", () => {
    it("should create a valid UUID", () => {
      const id = createAcpxProcessLeaseId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("should create unique IDs", () => {
      const id1 = createAcpxProcessLeaseId();
      const id2 = createAcpxProcessLeaseId();
      expect(id1).not.toBe(id2);
    });
  });

  describe("hashAcpxProcessCommand", () => {
    it("should produce consistent hash for same command", () => {
      const command = "node ./acpx-wrapper.js";
      const hash1 = hashAcpxProcessCommand(command);
      const hash2 = hashAcpxProcessCommand(command);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hash for different commands", () => {
      const hash1 = hashAcpxProcessCommand("node ./acpx-wrapper.js");
      const hash2 = hashAcpxProcessCommand("node ./different.js");
      expect(hash1).not.toBe(hash2);
    });

    it("should produce SHA256 hash", () => {
      const hash = hashAcpxProcessCommand("test");
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("normalizeAcpxProcessLease", () => {
    it("should normalize valid lease", () => {
      const lease = normalizeAcpxProcessLease({
        leaseId: "test-lease",
        gatewayInstanceId: "gateway-1",
        sessionKey: "session-1",
        wrapperRoot: "/tmp",
        wrapperPath: "/tmp/wrapper.js",
        rootPid: 1234,
        commandHash: "abc123",
        startedAt: Date.now(),
        state: "open",
      });
      expect(lease).toBeDefined();
      expect(lease?.leaseId).toBe("test-lease");
      expect(lease?.state).toBe("open");
    });

    it("should return undefined for invalid lease", () => {
      expect(normalizeAcpxProcessLease(null)).toBeUndefined();
      expect(normalizeAcpxProcessLease({})).toBeUndefined();
      expect(normalizeAcpxProcessLease({ leaseId: "test" })).toBeUndefined();
    });

    it("should handle optional processGroupId", () => {
      const lease = normalizeAcpxProcessLease({
        leaseId: "test-lease",
        gatewayInstanceId: "gateway-1",
        sessionKey: "session-1",
        wrapperRoot: "/tmp",
        wrapperPath: "/tmp/wrapper.js",
        rootPid: 1234,
        processGroupId: 5678,
        commandHash: "abc123",
        startedAt: Date.now(),
        state: "open",
      });
      expect(lease?.processGroupId).toBe(5678);
    });
  });

  describe("normalizeAcpxProcessLeaseFile", () => {
    it("should normalize valid lease file", () => {
      const file = normalizeAcpxProcessLeaseFile({
        version: 1,
        leases: [{
          leaseId: "test-lease",
          gatewayInstanceId: "gateway-1",
          sessionKey: "session-1",
          wrapperRoot: "/tmp",
          wrapperPath: "/tmp/wrapper.js",
          rootPid: 1234,
          commandHash: "abc123",
          startedAt: Date.now(),
          state: "open",
        }],
      });
      expect(file.version).toBe(1);
      expect(file.leases).toHaveLength(1);
    });

    it("should filter invalid leases", () => {
      const file = normalizeAcpxProcessLeaseFile({
        leases: [{ invalid: "lease" }],
      });
      expect(file.version).toBe(1);
      expect(file.leases).toHaveLength(0);
    });

    it("should handle empty file", () => {
      const file = normalizeAcpxProcessLeaseFile(null);
      expect(file.version).toBe(1);
      expect(file.leases).toHaveLength(0);
    });
  });

  describe("createAcpxProcessLeaseStore", () => {
    it("should save and load leases", async () => {
      const store = createAcpxProcessLeaseStore();
      const lease = {
        leaseId: "test-lease",
        gatewayInstanceId: "gateway-1",
        sessionKey: "session-1",
        wrapperRoot: "/tmp",
        wrapperPath: "/tmp/wrapper.js",
        rootPid: 1234,
        commandHash: "abc123",
        startedAt: Date.now(),
        state: "open" as const,
      };

      await store.save(lease);
      const loaded = await store.load("test-lease");
      expect(loaded).toEqual(lease);
    });

    it("should list open leases", async () => {
      const store = createAcpxProcessLeaseStore();
      await store.save({
        leaseId: "lease1",
        gatewayInstanceId: "gateway-1",
        sessionKey: "session-1",
        wrapperRoot: "/tmp",
        wrapperPath: "/tmp/wrapper.js",
        rootPid: 1234,
        commandHash: "abc123",
        startedAt: Date.now(),
        state: "open",
      });
      await store.save({
        leaseId: "lease2",
        gatewayInstanceId: "gateway-1",
        sessionKey: "session-2",
        wrapperRoot: "/tmp",
        wrapperPath: "/tmp/wrapper.js",
        rootPid: 5678,
        commandHash: "def456",
        startedAt: Date.now(),
        state: "closed",
      });

      const openLeases = await store.listOpen();
      expect(openLeases).toHaveLength(1);
      expect(openLeases[0].leaseId).toBe("lease1");
    });

    it("should mark lease state", async () => {
      const store = createAcpxProcessLeaseStore();
      await store.save({
        leaseId: "test-lease",
        gatewayInstanceId: "gateway-1",
        sessionKey: "session-1",
        wrapperRoot: "/tmp",
        wrapperPath: "/tmp/wrapper.js",
        rootPid: 1234,
        commandHash: "abc123",
        startedAt: Date.now(),
        state: "open",
      });

      await store.markState("test-lease", "closing");
      const lease = await store.load("test-lease");
      expect(lease?.state).toBe("closing");

      await store.markState("test-lease", "closed");
      const loaded = await store.load("test-lease");
      expect(loaded).toBeUndefined();
    });

    it("should filter leases by gateway instance", async () => {
      const store = createAcpxProcessLeaseStore();
      await store.save({
        leaseId: "lease1",
        gatewayInstanceId: "gateway-1",
        sessionKey: "session-1",
        wrapperRoot: "/tmp",
        wrapperPath: "/tmp/wrapper.js",
        rootPid: 1234,
        commandHash: "abc123",
        startedAt: Date.now(),
        state: "open",
      });
      await store.save({
        leaseId: "lease2",
        gatewayInstanceId: "gateway-2",
        sessionKey: "session-2",
        wrapperRoot: "/tmp",
        wrapperPath: "/tmp/wrapper.js",
        rootPid: 5678,
        commandHash: "def456",
        startedAt: Date.now(),
        state: "open",
      });

      const leases = await store.listOpen("gateway-1");
      expect(leases).toHaveLength(1);
      expect(leases[0].gatewayInstanceId).toBe("gateway-1");
    });
  });

  describe("withAcpxLeaseEnvironment", () => {
    it("should add env vars for non-windows", () => {
      const command = withAcpxLeaseEnvironment({
        command: "node ./test.js",
        leaseId: "test-lease",
        gatewayInstanceId: "gateway-1",
        platform: "darwin",
      });
      expect(command).toContain("OPENCLAW_ACPX_LEASE_ID");
      expect(command).toContain("OPENCLAW_GATEWAY_INSTANCE_ID");
      expect(command).toContain("test-lease");
      expect(command).toContain("gateway-1");
    });

    it("should add args for windows", () => {
      const command = withAcpxLeaseEnvironment({
        command: "node ./test.js",
        leaseId: "test-lease",
        gatewayInstanceId: "gateway-1",
        platform: "win32",
      });
      expect(command).toContain("--openclaw-acpx-lease-id");
      expect(command).toContain("--openclaw-gateway-instance-id");
    });
  });
});