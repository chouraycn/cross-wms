import { describe, it, expect, beforeEach, vi } from "vitest";
import { policyEngine } from "../policy.js";
import { sessionMapper } from "../sessionMapper.js";
import { permissionRelay } from "../permissionRelay.js";
import { approvalClassifier } from "../approvalClassifier.js";

describe("ACP 端到端集成测试", () => {
  beforeEach(() => {
    policyEngine.setActiveProfile("default");
    sessionMapper.clearBindings();
    permissionRelay.clearAllRequests();
  });

  describe("策略引擎 + 会话映射 集成", () => {
    it("绑定受限策略配置后，危险工具应被拒绝", () => {
      const sessionId = "session-restricted-001";
      sessionMapper.bindSession(sessionId, {
        userId: "user-001",
        policyProfileId: "restricted",
      });

      const binding = sessionMapper.getBinding(sessionId);
      expect(binding?.policyProfileId).toBe("restricted");

      policyEngine.setActiveProfile("restricted");
      const result = policyEngine.evaluateToolCall("exec");
      expect(result.allowed).toBe(false);
      expect(result.level).toBe("deny");
    });

    it("默认策略配置下，只读工具应放行", () => {
      const sessionId = "session-default-001";
      sessionMapper.bindSession(sessionId, {
        userId: "user-002",
        policyProfileId: "default",
      });

      policyEngine.setActiveProfile("default");
      const result = policyEngine.evaluateToolCall("listFiles");
      expect(result.allowed).toBe(true);
      expect(result.level).toBe("allow");
    });

    it("策略切换后行为应随之改变", () => {
      const sessionId = "session-switch-001";
      sessionMapper.bindSession(sessionId, {
        userId: "user-003",
        policyProfileId: "default",
      });

      policyEngine.setActiveProfile("default");
      const defaultResult = policyEngine.evaluateToolCall("writeFile");
      expect(defaultResult.requiresApproval).toBe(true);

      policyEngine.setActiveProfile("full");
      const fullResult = policyEngine.evaluateToolCall("writeFile");
      expect(fullResult.allowed).toBe(true);
      expect(fullResult.level).toBe("allow");
    });
  });

  describe("策略引擎 + 权限中继 + 审批分类器 集成", () => {
    it("需要审批的工具应创建审批请求并等待审批", () => {
      const sessionId = "session-approval-001";
      const toolName = "writeFile";
      const toolArgs = { path: "/tmp/test.txt", content: "hello" };

      policyEngine.setActiveProfile("default");
      const policyResult = policyEngine.evaluateToolCall(toolName, toolArgs);
      expect(policyResult.requiresApproval).toBe(true);

      const riskAssessment = approvalClassifier.classify({
        id: "test",
        sessionId,
        toolName,
        input: toolArgs,
        status: "pending",
        requestedAt: Date.now(),
        scope: "single",
      } as any);
      expect(riskAssessment.risk.level).toBeDefined();

      const request = permissionRelay.createRequest(sessionId, toolName, toolArgs, policyResult);
      expect(request.status).toBe("pending");
      expect(request.toolName).toBe(toolName);

      const pending = permissionRelay.getPendingRequests(sessionId);
      expect(pending.length).toBe(1);
      expect(pending[0].id).toBe(request.id);
    });

    it("审批通过后工具应可执行", () => {
      const toolName = "createDir";
      const toolArgs = { path: "/tmp/newdir" };
      const sessionId = "session-approve-002";

      policyEngine.setActiveProfile("default");
      const policyResult = policyEngine.evaluateToolCall(toolName, toolArgs);

      const request = permissionRelay.createRequest(sessionId, toolName, toolArgs, policyResult);
      expect(request.status).toBe("pending");

      const approved = permissionRelay.approve(request.id, "user-005");
      expect(approved).toBe(true);

      const updated = permissionRelay.getRequest(request.id);
      expect(updated?.status).toBe("approved");
    });

    it("审批拒绝后工具不应执行", () => {
      const toolName = "rm";
      const toolArgs = { path: "/tmp/important", recursive: true };
      const sessionId = "session-deny-003";

      policyEngine.setActiveProfile("default");
      const policyResult = policyEngine.evaluateToolCall(toolName, toolArgs);
      expect(policyResult.allowed).toBe(false);
      expect(policyResult.level).toBe("deny");

      const riskAssessment = approvalClassifier.classify({
        id: "test",
        sessionId,
        toolName,
        input: toolArgs,
        status: "pending",
        requestedAt: Date.now(),
        scope: "single",
      } as any);
      expect(["high", "critical"]).toContain(riskAssessment.risk.level);
    });
  });

  describe("会话策略绑定生命周期", () => {
    it("绑定 → 查询 → 解绑 完整流程", () => {
      const sessionId = "session-lifecycle-001";
      const userId = "user-lifecycle";

      expect(sessionMapper.getBinding(sessionId)).toBeUndefined();

      sessionMapper.bindSession(sessionId, {
        userId,
        policyProfileId: "restricted",
      });

      const binding = sessionMapper.getBinding(sessionId);
      expect(binding).toBeDefined();
      expect(binding?.userId).toBe(userId);
      expect(binding?.policyProfileId).toBe("restricted");

      const userSessions = sessionMapper.getUserSessions(userId);
      expect(userSessions.length).toBe(1);
      expect(userSessions[0]).toBe(sessionId);

      sessionMapper.unbindSession(sessionId);
      expect(sessionMapper.getBinding(sessionId)).toBeUndefined();
    });

    it("更新策略配置后应立即生效", () => {
      const sessionId = "session-update-001";

      sessionMapper.bindSession(sessionId, {
        userId: "user-006",
        policyProfileId: "default",
      });

      sessionMapper.updatePolicyProfile(sessionId, "full");
      const binding = sessionMapper.getBinding(sessionId);
      expect(binding?.policyProfileId).toBe("full");
    });
  });

  describe("多会话隔离测试", () => {
    it("不同会话的策略配置应相互独立", () => {
      sessionMapper.bindSession("session-a", {
        userId: "user-a",
        policyProfileId: "restricted",
      });
      sessionMapper.bindSession("session-b", {
        userId: "user-b",
        policyProfileId: "full",
      });

      const bindingA = sessionMapper.getBinding("session-a");
      const bindingB = sessionMapper.getBinding("session-b");

      expect(bindingA?.policyProfileId).toBe("restricted");
      expect(bindingB?.policyProfileId).toBe("full");
    });

    it("不同会话的审批请求应相互隔离", () => {
      const evalResult = {
        allowed: false,
        level: "prompt" as const,
        matchedRules: [],
        requiresApproval: true,
      };

      permissionRelay.createRequest("session-x", "writeFile", { path: "/a.txt" }, evalResult);
      permissionRelay.createRequest("session-y", "writeFile", { path: "/b.txt" }, evalResult);

      const xPending = permissionRelay.getPendingRequests("session-x");
      const yPending = permissionRelay.getPendingRequests("session-y");

      expect(xPending.length).toBe(1);
      expect(yPending.length).toBe(1);
      expect(xPending[0].sessionId).toBe("session-x");
      expect(yPending[0].sessionId).toBe("session-y");
    });
  });
});
