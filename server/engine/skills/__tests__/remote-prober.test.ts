/**
 * 远程节点探测系统测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  RemoteNodeProber,
  getCurrentPlatform,
  isMacOS,
  isLinux,
  isWindows,
  resetRemoteNodeProber,
} from "../runtime/remote-prober.js";

describe("RemoteNodeProber", () => {
  let prober: RemoteNodeProber;

  beforeEach(() => {
    resetRemoteNodeProber();
    prober = new RemoteNodeProber();
  });

  describe("addNode / getNode", () => {
    it("should add and retrieve node", () => {
      prober.addNode({
        id: "mac-node-1",
        host: "192.168.1.100",
        platform: "darwin",
      });

      const node = prober.getNode("mac-node-1");
      expect(node).toBeDefined();
      expect(node?.platform).toBe("darwin");
    });
  });

  describe("removeNode", () => {
    it("should remove node", () => {
      prober.addNode({
        id: "test-node",
        host: "localhost",
        platform: "linux",
      });

      const removed = prober.removeNode("test-node");
      expect(removed).toBe(true);

      const node = prober.getNode("test-node");
      expect(node).toBeUndefined();
    });

    it("should return false for unknown node", () => {
      const removed = prober.removeNode("unknown-node");
      expect(removed).toBe(false);
    });
  });

  describe("getAllNodes", () => {
    it("should return all nodes", () => {
      prober.addNode({ id: "node1", host: "host1", platform: "darwin" });
      prober.addNode({ id: "node2", host: "host2", platform: "linux" });

      const nodes = prober.getAllNodes();
      expect(nodes).toHaveLength(2);
    });
  });

  describe("clearCache", () => {
    it("should clear status cache", () => {
      prober.clearCache();
      // No error means success
    });
  });

  describe("setCacheTimeout", () => {
    it("should set cache timeout", () => {
      prober.setCacheTimeout(120000);
      // No error means success
    });
  });
});

describe("Platform helpers", () => {
  describe("getCurrentPlatform", () => {
    it("should return current platform", () => {
      const platform = getCurrentPlatform();
      expect(["darwin", "linux", "win32"]).toContain(platform);
    });
  });

  describe("isMacOS", () => {
    it("should return correct value", () => {
      const result = isMacOS();
      expect(typeof result).toBe("boolean");
      expect(result).toBe(process.platform === "darwin");
    });
  });

  describe("isLinux", () => {
    it("should return correct value", () => {
      const result = isLinux();
      expect(typeof result).toBe("boolean");
      expect(result).toBe(process.platform === "linux");
    });
  });

  describe("isWindows", () => {
    it("should return correct value", () => {
      const result = isWindows();
      expect(typeof result).toBe("boolean");
      expect(result).toBe(process.platform === "win32");
    });
  });
});