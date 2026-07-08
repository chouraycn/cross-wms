import { describe, it, expect } from "vitest";
import { ApprovalClassifier } from "../approvalClassifier.js";
import { PermissionRelay } from "../permissionRelay.js";
import { PolicyEngine } from "../policy.js";

describe("ApprovalClassifier", () => {
  describe("classify", () => {
    it("should auto-approve low risk tools", () => {
      const classifier = new ApprovalClassifier();
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      
      const evaluation = engine.evaluateToolCall("listFiles");
      const request = relay.createRequest("session1", "listFiles", {}, evaluation);
      
      const classification = classifier.classify(request);
      
      expect(classification.risk.level).toBe("low");
      expect(classification.autoApprove).toBe(true);
      expect(classification.suggestedAction).toBe("approve");
    });

    it("should auto-deny critical risk tools", () => {
      const classifier = new ApprovalClassifier();
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      
      const evaluation = engine.evaluateToolCall("exec");
      const request = relay.createRequest("session1", "exec", { command: "rm -rf /" }, evaluation);
      
      const classification = classifier.classify(request);
      
      expect(classification.risk.level).toBe("critical");
      expect(classification.autoDeny).toBe(true);
      expect(classification.suggestedAction).toBe("deny");
    });

    it("should require approval for medium risk tools", () => {
      const classifier = new ApprovalClassifier();
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      
      const evaluation = engine.evaluateToolCall("writeFile");
      const request = relay.createRequest("session1", "writeFile", { path: "/tmp/test" }, evaluation);
      
      const classification = classifier.classify(request);
      
      expect(classification.risk.level).toBe("medium");
      expect(classification.autoApprove).toBe(false);
      expect(classification.autoDeny).toBe(false);
      expect(classification.suggestedAction).toBe("require_approval");
    });
  });

  describe("assessRisk", () => {
    it("should assess read-only tools as low risk", () => {
      const classifier = new ApprovalClassifier();
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      
      const evaluation = engine.evaluateToolCall("getInfo");
      const request = relay.createRequest("session1", "getInfo", {}, evaluation);
      
      const risk = classifier.assessRisk(request);
      
      expect(risk.level).toBe("low");
      expect(risk.category).toBe("read");
    });

    it("should assess write tools as medium risk", () => {
      const classifier = new ApprovalClassifier();
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      
      const evaluation = engine.evaluateToolCall("createFile");
      const request = relay.createRequest("session1", "createFile", {}, evaluation);
      
      const risk = classifier.assessRisk(request);
      
      expect(risk.level).toBe("medium");
      expect(risk.category).toBe("write");
    });

    it("should assess network tools as medium risk", () => {
      const classifier = new ApprovalClassifier();
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      
      const evaluation = engine.evaluateToolCall("httpGet");
      const request = relay.createRequest("session1", "httpGet", { url: "https://example.com" }, evaluation);
      
      const risk = classifier.assessRisk(request);
      
      expect(risk.level).toBe("medium");
      expect(risk.category).toBe("network");
    });

    it("should assess sensitive tools as high risk", () => {
      const classifier = new ApprovalClassifier();
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      
      const evaluation = engine.evaluateToolCall("getSecrets");
      const request = relay.createRequest("session1", "getSecrets", {}, evaluation);
      
      const risk = classifier.assessRisk(request);
      
      expect(risk.level).toBe("high");
      expect(risk.category).toBe("sensitive");
    });

    it("should detect dangerous input patterns", () => {
      const classifier = new ApprovalClassifier();
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      
      const evaluation = engine.evaluateToolCall("exec");
      const request = relay.createRequest("session1", "exec", { command: "rm -rf /" }, evaluation);
      
      const risk = classifier.assessRisk(request);
      
      expect(risk.level).toBe("critical");
      expect(risk.factors.some(f => f.name === "InputRisk")).toBe(true);
    });
  });

  describe("canAutoApprove", () => {
    it("should return true for low risk tools", () => {
      const classifier = new ApprovalClassifier();
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      
      const evaluation = engine.evaluateToolCall("search");
      const request = relay.createRequest("session1", "search", {}, evaluation);
      
      expect(classifier.canAutoApprove(request)).toBe(true);
    });

    it("should return false for medium risk tools", () => {
      const classifier = new ApprovalClassifier();
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      
      const evaluation = engine.evaluateToolCall("writeFile");
      const request = relay.createRequest("session1", "writeFile", {}, evaluation);
      
      expect(classifier.canAutoApprove(request)).toBe(false);
    });
  });

  describe("canAutoDeny", () => {
    it("should return true for critical risk tools", () => {
      const classifier = new ApprovalClassifier();
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      
      const evaluation = engine.evaluateToolCall("exec");
      const request = relay.createRequest("session1", "exec", { command: "sudo shutdown" }, evaluation);
      
      expect(classifier.canAutoDeny(request)).toBe(true);
    });

    it("should return false for medium risk tools", () => {
      const classifier = new ApprovalClassifier();
      const relay = new PermissionRelay();
      const engine = new PolicyEngine();
      
      const evaluation = engine.evaluateToolCall("writeFile");
      const request = relay.createRequest("session1", "writeFile", {}, evaluation);
      
      expect(classifier.canAutoDeny(request)).toBe(false);
    });
  });
});
