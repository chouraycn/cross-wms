import { describe, it, expect, vi } from "vitest";
import { PermissionRelay } from "../permissionRelay.js";
import { PolicyEngine } from "../policy.js";

describe("PermissionRelay", () => {
  describe("createRequest", () => {
    it("should create a pending approval request", () => {
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      const evaluation = engine.evaluateToolCall("writeFile");
      
      const request = relay.createRequest("session1", "writeFile", { path: "/tmp/test" }, evaluation);
      
      expect(request.id).toMatch(/^approval_/);
      expect(request.sessionId).toBe("session1");
      expect(request.toolName).toBe("writeFile");
      expect(request.status).toBe("pending");
      expect(request.requestedAt).toBeDefined();
    });

    it("should track pending requests count", () => {
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      
      const evaluation = engine.evaluateToolCall("writeFile");
      relay.createRequest("session1", "writeFile", {}, evaluation);
      
      const stats = relay.getStats();
      expect(stats.pending).toBe(1);
    });
  });

  describe("approve", () => {
    it("should approve a pending request", () => {
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      const evaluation = engine.evaluateToolCall("writeFile");
      
      const request = relay.createRequest("session1", "writeFile", {}, evaluation);
      const result = relay.approve(request.id, "user1");
      
      expect(result).toBe(true);
      expect(request.status).toBe("approved");
      expect(request.approvedBy).toBe("user1");
    });

    it("should return false for non-existent request", () => {
      const relay = new PermissionRelay();
      const result = relay.approve("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("deny", () => {
    it("should deny a pending request", () => {
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      const evaluation = engine.evaluateToolCall("writeFile");
      
      const request = relay.createRequest("session1", "writeFile", {}, evaluation);
      const result = relay.deny(request.id, "Too dangerous");
      
      expect(result).toBe(true);
      expect(request.status).toBe("denied");
      expect(request.denialReason).toBe("Too dangerous");
    });
  });

  describe("isApproved", () => {
    it("should return true for approved request", () => {
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      const evaluation = engine.evaluateToolCall("writeFile");
      
      const request = relay.createRequest("session1", "writeFile", {}, evaluation);
      relay.approve(request.id);
      
      expect(relay.isApproved(request.id)).toBe(true);
    });

    it("should return false for pending request", () => {
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      const evaluation = engine.evaluateToolCall("writeFile");
      
      const request = relay.createRequest("session1", "writeFile", {}, evaluation);
      
      expect(relay.isApproved(request.id)).toBe(false);
    });
  });

  describe("getPendingRequests", () => {
    it("should filter pending requests by session", () => {
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      const evaluation = engine.evaluateToolCall("writeFile");
      
      relay.createRequest("session1", "writeFile", {}, evaluation);
      relay.createRequest("session2", "writeFile", {}, evaluation);
      
      const pending = relay.getPendingRequests("session1");
      expect(pending.length).toBe(1);
      expect(pending[0].sessionId).toBe("session1");
    });
  });

  describe("clearSessionRequests", () => {
    it("should clear all requests for a session", () => {
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      const evaluation = engine.evaluateToolCall("writeFile");
      
      relay.createRequest("session1", "writeFile", {}, evaluation);
      relay.createRequest("session1", "createFile", {}, evaluation);
      relay.createRequest("session2", "writeFile", {}, evaluation);
      
      relay.clearSessionRequests("session1");
      
      const pending = relay.getPendingRequests();
      expect(pending.length).toBe(1);
      expect(pending[0].sessionId).toBe("session2");
    });
  });

  describe("getStats", () => {
    it("should return correct statistics", () => {
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      const evaluation = engine.evaluateToolCall("writeFile");
      
      const req1 = relay.createRequest("session1", "writeFile", {}, evaluation);
      const req2 = relay.createRequest("session1", "createFile", {}, evaluation);
      const req3 = relay.createRequest("session2", "updateFile", {}, evaluation);
      
      relay.approve(req1.id);
      relay.deny(req2.id);
      
      const stats = relay.getStats();
      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(1);
      expect(stats.approved).toBe(1);
      expect(stats.denied).toBe(1);
    });
  });
});
