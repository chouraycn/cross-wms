import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { buildPolicyConformanceReport, POLICY_CONFORMANCE_CHECK_IDS } from "../policyConformance.js";
import { promises as fs } from "node:fs";

vi.mock("node:fs", () => ({
  promises: {
    readFile: vi.fn(),
  },
}));

describe("PolicyConformance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("buildPolicyConformanceReport", () => {
    it("should return ok report when policies match", async () => {
      (fs.readFile as Mock).mockResolvedValueOnce(JSON.stringify({
        rules: [{ id: "rule1", level: "deny", conditions: [], priority: 1 }],
      }));
      (fs.readFile as Mock).mockResolvedValueOnce(JSON.stringify({
        rules: [{ id: "rule1", level: "deny", conditions: [], priority: 1 }],
      }));

      const report = await buildPolicyConformanceReport({
        baselinePath: "/tmp/baseline.json",
        policyPath: "/tmp/policy.json",
      });

      expect(report.ok).toBe(true);
      expect(report.findings).toHaveLength(0);
    });

    it("should return missing finding when policy is missing rule", async () => {
      (fs.readFile as Mock).mockResolvedValueOnce(JSON.stringify({
        rules: [{ id: "rule1", level: "deny", conditions: [], priority: 1 }],
      }));
      (fs.readFile as Mock).mockResolvedValueOnce(JSON.stringify({
        rules: [],
      }));

      const report = await buildPolicyConformanceReport({
        baselinePath: "/tmp/baseline.json",
        policyPath: "/tmp/policy.json",
      });

      expect(report.ok).toBe(false);
      expect(report.findings[0].checkId).toBe(POLICY_CONFORMANCE_CHECK_IDS.missing);
    });

    it("should return weaker finding when policy rule is weaker", async () => {
      (fs.readFile as Mock).mockResolvedValueOnce(JSON.stringify({
        rules: [{ id: "rule1", level: "deny", conditions: [], priority: 1 }],
      }));
      (fs.readFile as Mock).mockResolvedValueOnce(JSON.stringify({
        rules: [{ id: "rule1", level: "allow", conditions: [], priority: 1 }],
      }));

      const report = await buildPolicyConformanceReport({
        baselinePath: "/tmp/baseline.json",
        policyPath: "/tmp/policy.json",
      });

      expect(report.ok).toBe(false);
      expect(report.findings[0].checkId).toBe(POLICY_CONFORMANCE_CHECK_IDS.weaker);
    });

    it("should return invalid finding when file cannot be read", async () => {
      (fs.readFile as Mock).mockRejectedValueOnce(new Error("file not found"));

      const report = await buildPolicyConformanceReport({
        baselinePath: "/tmp/baseline.json",
        policyPath: "/tmp/policy.json",
      });

      expect(report.ok).toBe(false);
      expect(report.findings[0].checkId).toBe(POLICY_CONFORMANCE_CHECK_IDS.invalid);
    });

    it("should return invalid finding when file has invalid JSON", async () => {
      (fs.readFile as Mock).mockResolvedValueOnce("invalid json");

      const report = await buildPolicyConformanceReport({
        baselinePath: "/tmp/baseline.json",
        policyPath: "/tmp/policy.json",
      });

      expect(report.ok).toBe(false);
      expect(report.findings[0].checkId).toBe(POLICY_CONFORMANCE_CHECK_IDS.invalid);
    });

    it("should pass when policy is stricter than baseline", async () => {
      (fs.readFile as Mock).mockResolvedValueOnce(JSON.stringify({
        rules: [{ id: "rule1", level: "prompt", conditions: [], priority: 1 }],
      }));
      (fs.readFile as Mock).mockResolvedValueOnce(JSON.stringify({
        rules: [{ id: "rule1", level: "deny", conditions: [], priority: 1 }],
      }));

      const report = await buildPolicyConformanceReport({
        baselinePath: "/tmp/baseline.json",
        policyPath: "/tmp/policy.json",
      });

      expect(report.ok).toBe(true);
    });
  });
});