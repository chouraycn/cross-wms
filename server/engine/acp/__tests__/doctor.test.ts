import { describe, it, expect } from "vitest";
import {
  runDoctorChecks,
  checkCorePolicy,
  checkToolPolicy,
  checkExecApprovals,
  checkChannels,
  checkSandbox,
  checkGateway,
  checkModelNetwork,
  checkDataAuth,
  checkPolicy,
  initDoctorChannelRegistry,
} from "../doctor.js";
import { DEFAULT_PERMISSION_PROFILE } from "../policy.js";

describe("Doctor", () => {
  describe("checkCorePolicy", () => {
    it("should warn when no rules defined", () => {
      const result = checkCorePolicy({ rules: [], runtimeAvailable: true });
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("warning");
    });

    it("should warn when runtime is not available", () => {
      const result = checkCorePolicy({ rules: DEFAULT_PERMISSION_PROFILE.rules, runtimeAvailable: false });
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("warning");
      expect(result.findings[0].id).toContain("missing-runtime");
    });

    it("should validate policy rules", () => {
      const result = checkCorePolicy({ rules: DEFAULT_PERMISSION_PROFILE.rules, runtimeAvailable: true });
      expect(result.findings).toHaveLength(0);
    });

    it("should find invalid rules", () => {
      const result = checkCorePolicy({
        rules: [{
          id: "invalid",
          name: "",
          category: "tool",
          scope: "global",
          level: "invalid" as any,
          conditions: [],
          priority: 1,
        }],
        runtimeAvailable: true,
      });
      expect(result.findings).toHaveLength(2);
    });
  });

  describe("checkToolPolicy", () => {
    it("should report tools without group", () => {
      const result = checkToolPolicy({ toolNames: ["unknown_tool", "exec"] });
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].message).toContain("unknown_tool");
    });

    it("should not report tools with groups", () => {
      const result = checkToolPolicy({ toolNames: ["exec", "read", "web_search"] });
      expect(result.findings).toHaveLength(0);
    });

    it("should handle empty tool names", () => {
      const result = checkToolPolicy({ toolNames: [] });
      expect(result.findings).toHaveLength(0);
    });
  });

  describe("checkExecApprovals", () => {
    it("should warn when default level is allow", () => {
      const result = checkExecApprovals({ defaultLevel: "allow", approvalFlowEnabled: true });
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("warning");
    });

    it("should warn when approval flow is not enabled", () => {
      const result = checkExecApprovals({ defaultLevel: "prompt", approvalFlowEnabled: false });
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].id).toContain("missing-approval-flow");
    });

    it("should not warn for prompt default with approval flow", () => {
      const result = checkExecApprovals({ defaultLevel: "prompt", approvalFlowEnabled: true });
      expect(result.findings).toHaveLength(0);
    });

    it("should not warn for deny default", () => {
      const result = checkExecApprovals({ defaultLevel: "deny", approvalFlowEnabled: true });
      expect(result.findings).toHaveLength(0);
    });
  });

  describe("checkChannels", () => {
    it("should warn when no channels are registered", () => {
      initDoctorChannelRegistry(() => ({
        listAll: () => [],
      }));
      const result = checkChannels({});
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("warning");
      expect(result.findings[0].id).toContain("no-channels");
    });

    it("should detect enabled but unregistered channels", () => {
      initDoctorChannelRegistry(() => ({
        listAll: () => [],
      }));
      const result = checkChannels({ enabledChannels: ["unknown_channel"] });
      expect(result.findings).toHaveLength(2);
      const notRegistered = result.findings.find(f => f.id.includes("channel-not-registered"));
      expect(notRegistered).toBeDefined();
    });

    it("should not report errors for valid registered channels", () => {
      initDoctorChannelRegistry(() => ({
        listAll: () => [{
          id: "web",
          meta: { name: "Web", aliases: [] },
          capabilities: { authRequired: false },
          config: {
            listAccountIds: () => [],
            resolveAccount: () => undefined,
            isEnabled: () => false,
          },
          message: { send: () => {} },
        }],
      }));
      const result = checkChannels({ enabledChannels: ["web"] });
      expect(result.findings).toHaveLength(0);
    });

    it("should check channel auth requirements", () => {
      initDoctorChannelRegistry(() => ({
        listAll: () => [{
          id: "test-channel",
          meta: { name: "Test", aliases: [] },
          capabilities: { authRequired: true },
          config: {
            listAccountIds: () => [],
            resolveAccount: () => undefined,
            isEnabled: () => false,
          },
          message: { send: () => {} },
        }],
      }));
      const result = checkChannels({});
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].id).toContain("channel-auth-missing");
    });
  });

  describe("checkSandbox", () => {
    it("should not report findings when sandbox is disabled", () => {
      const result = checkSandbox({ enabled: false });
      expect(result.findings).toHaveLength(0);
    });

    it("should error when sandbox is enabled but docker is not available", () => {
      const result = checkSandbox({ enabled: true, dockerAvailable: false, config: { image: "test" } });
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("error");
      expect(result.findings[0].id).toContain("docker-missing");
    });

    it("should warn when sandbox is enabled but not configured", () => {
      const result = checkSandbox({ enabled: true, dockerAvailable: true, config: {} });
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("warning");
      expect(result.findings[0].id).toContain("not-configured");
    });

    it("should not report findings when sandbox is properly configured", () => {
      const result = checkSandbox({ enabled: true, dockerAvailable: true, config: { image: "test" } });
      expect(result.findings).toHaveLength(0);
    });
  });

  describe("checkGateway", () => {
    it("should error when gateway mode is not configured", () => {
      const result = checkGateway({});
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("error");
      expect(result.findings[0].id).toContain("not-configured");
    });

    it("should error when gateway mode is invalid", () => {
      const result = checkGateway({ mode: "invalid" });
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("error");
      expect(result.findings[0].id).toContain("mode-invalid");
    });

    it("should warn when local gateway has no auth", () => {
      const result = checkGateway({ mode: "local" });
      expect(result.findings).toHaveLength(2);
      const authMissing = result.findings.find(f => f.id.includes("auth-missing"));
      const tokenMissing = result.findings.find(f => f.id.includes("token-missing"));
      expect(authMissing).toBeDefined();
      expect(tokenMissing).toBeDefined();
    });

    it("should not warn when local gateway has auth token", () => {
      const result = checkGateway({ mode: "local", authToken: "test-token" });
      expect(result.findings).toHaveLength(0);
    });

    it("should not warn when remote gateway has no auth", () => {
      const result = checkGateway({ mode: "remote" });
      expect(result.findings).toHaveLength(0);
    });

    it("should error when port is invalid", () => {
      const result = checkGateway({ mode: "local", port: 70000 });
      expect(result.findings).toHaveLength(3);
      const portError = result.findings.find(f => f.id.includes("port-conflict"));
      expect(portError).toBeDefined();
    });
  });

  describe("checkModelNetwork", () => {
    it("should warn when no providers are configured", () => {
      const result = checkModelNetwork({});
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("warning");
      expect(result.findings[0].id).toContain("provider-not-available");
    });

    it("should warn when auth is not configured", () => {
      const result = checkModelNetwork({ providers: ["openai"], authConfigured: false });
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].id).toContain("provider-auth-missing");
    });

    it("should not report findings when providers are properly configured", () => {
      const result = checkModelNetwork({ providers: ["openai"], authConfigured: true });
      expect(result.findings).toHaveLength(0);
    });
  });

  describe("checkDataAuth", () => {
    it("should warn when no auth profiles are configured", () => {
      const result = checkDataAuth({});
      expect(result.findings).toHaveLength(3);
      const profileMissing = result.findings.find(f => f.id.includes("auth-profile-missing"));
      const sessionAuthMissing = result.findings.find(f => f.id.includes("session-auth-missing"));
      const secretMissing = result.findings.find(f => f.id.includes("secret-management-missing"));
      expect(profileMissing).toBeDefined();
      expect(sessionAuthMissing).toBeDefined();
      expect(secretMissing).toBeDefined();
    });

    it("should only info for missing secret management", () => {
      const result = checkDataAuth({ authProfiles: ["default"], sessionAuthEnabled: true });
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("info");
    });

    it("should not report findings when all auth is configured", () => {
      const result = checkDataAuth({
        authProfiles: ["default"],
        sessionAuthEnabled: true,
        secretManagementEnabled: true,
      });
      expect(result.findings).toHaveLength(0);
    });
  });

  describe("checkPolicy", () => {
    it("should not report findings when no rules", () => {
      const result = checkPolicy({ rules: [] });
      expect(result.findings).toHaveLength(0);
    });

    it("should warn when all rules are allow", () => {
      const result = checkPolicy({
        rules: [
          { id: "rule1", name: "Allow All", category: "tool", scope: "global", level: "allow", conditions: [], priority: 1 },
          { id: "rule2", name: "Allow More", category: "tool", scope: "global", level: "allow", conditions: [], priority: 2 },
        ],
      });
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].id).toContain("missing-defaults");
    });

    it("should error when duplicate rule ids", () => {
      const result = checkPolicy({
        rules: [
          { id: "duplicate", name: "Rule 1", category: "tool", scope: "global", level: "allow", conditions: [], priority: 1 },
          { id: "duplicate", name: "Rule 2", category: "tool", scope: "global", level: "deny", conditions: [], priority: 2 },
        ],
      });
      expect(result.findings).toHaveLength(2);
      const conflict = result.findings.find(f => f.id.includes("policy-conflict"));
      expect(conflict).toBeDefined();
    });

    it("should warn when rules have inconsistent levels for same category/scope", () => {
      const result = checkPolicy({
        rules: [
          { id: "rule1", name: "Allow", category: "tool", scope: "global", level: "allow", conditions: [], priority: 1 },
          { id: "rule2", name: "Deny", category: "tool", scope: "global", level: "deny", conditions: [], priority: 2 },
        ],
      });
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].id).toContain("inconsistent-levels");
    });

    it("should validate DEFAULT_PERMISSION_PROFILE rules", () => {
      const result = checkPolicy({ rules: DEFAULT_PERMISSION_PROFILE.rules });
      const errors = result.findings.filter(f => f.severity === "error");
      expect(errors).toHaveLength(0);
    });
  });

  describe("runDoctorChecks", () => {
    it("should run basic checks", async () => {
      const report = await runDoctorChecks({
        scopes: ["core", "tools", "exec-approvals"],
        rules: DEFAULT_PERMISSION_PROFILE.rules,
        toolNames: ["exec", "read"],
        defaultLevel: "prompt",
        approvalFlowEnabled: true,
        runtimeAvailable: true,
      });
      expect(report.ok).toBe(true);
      expect(report.scopesChecked).toBe(3);
      expect(report.totalFindings).toBe(0);
    });

    it("should return report with findings", async () => {
      const report = await runDoctorChecks({
        scopes: ["core", "exec-approvals"],
        rules: [],
        defaultLevel: "allow",
        approvalFlowEnabled: false,
        runtimeAvailable: true,
      });
      expect(report.ok).toBe(true);
      expect(report.totalFindings).toBe(3);
    });

    it("should return not ok when there are error findings", async () => {
      const report = await runDoctorChecks({
        scopes: ["core"],
        rules: [{
          id: "invalid",
          name: "",
          category: "tool",
          scope: "global",
          level: "invalid" as any,
          conditions: [],
          priority: 1,
        }],
        runtimeAvailable: true,
      });
      expect(report.ok).toBe(false);
      expect(report.findings.some(f => f.severity === "error")).toBe(true);
    });

    it("should handle partial scopes", async () => {
      const report = await runDoctorChecks({
        scopes: ["tools"],
        toolNames: ["unknown_tool"],
      });
      expect(report.scopesChecked).toBe(1);
      expect(report.totalFindings).toBe(1);
    });

    it("should run all scopes", async () => {
      initDoctorChannelRegistry(() => ({
        listAll: () => [{
          id: "web",
          meta: { name: "Web", aliases: [] },
          capabilities: { authRequired: false },
          config: {
            listAccountIds: () => [],
            resolveAccount: () => undefined,
            isEnabled: () => false,
          },
          message: { send: () => {} },
        }],
      }));
      const report = await runDoctorChecks({
        scopes: ["core", "tools", "exec-approvals", "channels", "sandbox", "gateway", "model-network", "data-auth", "policy"],
        rules: DEFAULT_PERMISSION_PROFILE.rules,
        toolNames: ["exec"],
        defaultLevel: "prompt",
        approvalFlowEnabled: true,
        runtimeAvailable: true,
        enabledChannels: ["web"],
        sandbox: { enabled: false },
        gateway: { mode: "local", authToken: "test" },
        modelNetwork: { providers: ["openai"], authConfigured: true },
        dataAuth: { authProfiles: ["default"], sessionAuthEnabled: true, secretManagementEnabled: true },
      });
      expect(report.ok).toBe(true);
      expect(report.scopesChecked).toBe(9);
      const errors = report.findings.filter(f => f.severity === "error");
      expect(errors).toHaveLength(0);
    });
  });
});