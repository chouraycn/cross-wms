/**
 * 技能优先级系统测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  SkillPriorityResolver,
  SkillPriority,
  getPriorityName,
  comparePriority,
  isHigherPriority,
  resetSkillPriorityResolver,
} from "../discovery/skill-priority.js";

describe("SkillPriorityResolver", () => {
  let resolver: SkillPriorityResolver;

  beforeEach(() => {
    resetSkillPriorityResolver();
    resolver = new SkillPriorityResolver();
  });

  describe("getSkillRoots", () => {
    it("should return roots sorted by priority", () => {
      const roots = resolver.getSkillRoots();

      expect(roots.length).toBeGreaterThan(0);
      expect(roots[0].priority).toBe(SkillPriority.WORKSPACE);
    });
  });

  describe("resolveSkill", () => {
    it("should return empty sources for non-existent skill", async () => {
      const result = await resolver.resolveSkill("non-existent-skill");

      expect(result.skillName).toBe("non-existent-skill");
      expect(result.sources).toEqual([]);
      expect(result.selected).toBeUndefined();
      expect(result.overridden).toBe(false);
    });
  });

  describe("getConfig", () => {
    it("should return current config", () => {
      const config = resolver.getConfig();

      expect(config).toBeDefined();
      expect(config.workspaceDir).toBeDefined();
    });
  });

  describe("updateConfig", () => {
    it("should update config and clear cache", () => {
      resolver.updateConfig({ workspaceDir: "/new/workspace" });
      const config = resolver.getConfig();

      expect(config.workspaceDir).toBe("/new/workspace");
    });
  });

  describe("clearCache", () => {
    it("should clear skill cache", () => {
      resolver.clearCache();
      // No error means success
    });
  });
});

describe("Priority helpers", () => {
  describe("getPriorityName", () => {
    it("should return correct names", () => {
      expect(getPriorityName(SkillPriority.WORKSPACE)).toBe("Workspace");
      expect(getPriorityName(SkillPriority.PROJECT_AGENT)).toBe("Project Agent");
      expect(getPriorityName(SkillPriority.PERSONAL_AGENT)).toBe("Personal Agent");
      expect(getPriorityName(SkillPriority.MANAGED)).toBe("Managed");
      expect(getPriorityName(SkillPriority.BUNDLED)).toBe("Bundled");
      expect(getPriorityName(SkillPriority.EXTRA)).toBe("Extra");
    });
  });

  describe("comparePriority", () => {
    it("should return negative for higher priority", () => {
      expect(comparePriority(SkillPriority.WORKSPACE, SkillPriority.BUNDLED)).toBeLessThan(0);
    });

    it("should return positive for lower priority", () => {
      expect(comparePriority(SkillPriority.EXTRA, SkillPriority.WORKSPACE)).toBeGreaterThan(0);
    });

    it("should return zero for equal priority", () => {
      expect(comparePriority(SkillPriority.MANAGED, SkillPriority.MANAGED)).toBe(0);
    });
  });

  describe("isHigherPriority", () => {
    it("should return true for higher priority", () => {
      expect(isHigherPriority(SkillPriority.WORKSPACE, SkillPriority.EXTRA)).toBe(true);
    });

    it("should return false for lower priority", () => {
      expect(isHigherPriority(SkillPriority.EXTRA, SkillPriority.WORKSPACE)).toBe(false);
    });
  });
});