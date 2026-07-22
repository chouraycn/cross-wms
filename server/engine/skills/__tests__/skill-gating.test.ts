/**
 * 技能门控系统测试
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SkillGatingManager,
  resetSkillGatingManager,
} from "../discovery/skill-gating.js";

// Mock exec
vi.mock("child_process", () => ({
  exec: vi.fn((_cmd: string, _opts: unknown, cb: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
    cb(null, { stdout: "/usr/bin/node", stderr: "" });
  }),
}));

describe("SkillGatingManager", () => {
  let manager: SkillGatingManager;

  beforeEach(() => {
    resetSkillGatingManager();
    manager = new SkillGatingManager();
    vi.clearAllMocks();
  });

  describe("checkEnv", () => {
    it("should return true for existing env var", () => {
      process.env.TEST_VAR = "value";
      expect(manager.checkEnv("TEST_VAR")).toBe(true);
    });

    it("should return false for missing env var", () => {
      delete process.env.MISSING_VAR;
      expect(manager.checkEnv("MISSING_VAR")).toBe(false);
    });

    it("should return false for empty env var", () => {
      process.env.EMPTY_VAR = "";
      expect(manager.checkEnv("EMPTY_VAR")).toBe(false);
    });
  });

  describe("checkEnvs", () => {
    it("should categorize env vars correctly", () => {
      process.env.EXISTING_VAR = "value";
      delete process.env.MISSING_VAR;

      const result = manager.checkEnvs(["EXISTING_VAR", "MISSING_VAR"]);
      expect(result.exists).toEqual(["EXISTING_VAR"]);
      expect(result.missing).toEqual(["MISSING_VAR"]);
    });
  });

  describe("checkGating", () => {
    it("should pass when all requirements are met", async () => {
      process.env.TEST_ENV = "value";

      const result = await manager.checkGating({
        env: ["TEST_ENV"],
      });

      expect(result.passed).toBe(true);
      expect(result.missingEnv).toEqual([]);
    });

    it("should fail when env is missing", async () => {
      delete process.env.MISSING_ENV;

      const result = await manager.checkGating({
        env: ["MISSING_ENV"],
      });

      expect(result.passed).toBe(false);
      expect(result.missingEnv).toEqual(["MISSING_ENV"]);
      expect(result.installGuidance).toContain("Set environment variable: MISSING_ENV");
    });
  });

  describe("clearCache", () => {
    it("should clear bin cache", () => {
      manager.clearCache();
      const status = manager.getCacheStatus();
      expect(status.size).toBe(0);
    });
  });
});