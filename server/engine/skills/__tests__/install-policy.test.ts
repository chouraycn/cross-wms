/**
 * 安装策略系统测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  InstallPolicyManager,
  resetInstallPolicyManager,
} from "../security/install-policy.js";

describe("InstallPolicyManager", () => {
  let manager: InstallPolicyManager;

  beforeEach(() => {
    resetInstallPolicyManager();
    manager = new InstallPolicyManager();
  });

  describe("checkPolicy", () => {
    it("should allow local source by default", async () => {
      const result = await manager.checkPolicy({
        source: "local",
        skillName: "test-skill",
        targetPath: "/path/to/skill",
      });

      expect(result.allowed).toBe(true);
      expect(result.decisionSource).toBe("default");
    });

    it("should allow clawhub source by default", async () => {
      const result = await manager.checkPolicy({
        source: "clawhub",
        skillName: "weather",
        targetPath: "/path/to/skill",
        sourceUrl: "https://clawhub.com/skills/weather",
      });

      expect(result.allowed).toBe(true);
    });

    it("should reject disallowed source type", async () => {
      manager.updateSecurityConfig({
        allowedSources: ["clawhub", "local"],
      });

      const result = await manager.checkPolicy({
        source: "url",
        skillName: "test-skill",
        targetPath: "/path/to/skill",
        sourceUrl: "https://example.com/skill.zip",
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('Source type "url" is not allowed');
    });
  });

  describe("updatePolicy", () => {
    it("should update policy command", () => {
      manager.updatePolicy({
        command: "/usr/local/bin/policy-check",
        timeout: 10000,
      });

      const config = manager.getConfig();
      expect(config.installPolicy?.command).toBe("/usr/local/bin/policy-check");
      expect(config.installPolicy?.timeout).toBe(10000);
    });
  });

  describe("getConfig", () => {
    it("should return current config", () => {
      const config = manager.getConfig();
      expect(config).toBeDefined();
    });
  });
});