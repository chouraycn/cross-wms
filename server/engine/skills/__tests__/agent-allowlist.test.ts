/**
 * Agent 白名单系统测试
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AgentAllowlistManager,
  resetAgentAllowlistManager,
} from "../discovery/agent-allowlist.js";

describe("AgentAllowlistManager", () => {
  let manager: AgentAllowlistManager;

  beforeEach(() => {
    resetAgentAllowlistManager();
    manager = new AgentAllowlistManager();
  });

  describe("constructor", () => {
    it("should create manager with default config", () => {
      expect(manager).toBeDefined();
      expect(manager.getAgents()).toEqual([]);
      expect(manager.getDefaultSkills()).toEqual([]);
    });

    it("should create manager with provided config", () => {
      const configManager = new AgentAllowlistManager({
        defaults: { skills: ["skill1", "skill2"] },
        list: [{ id: "agent1", skills: ["skill3"] }],
      });

      expect(configManager.getDefaultSkills()).toEqual(["skill1", "skill2"]);
      expect(configManager.getAgents()).toHaveLength(1);
    });
  });

  describe("getEffectiveAllowlist", () => {
    it("should return unrestricted when no config", () => {
      const result = manager.getEffectiveAllowlist("unknown-agent");
      expect(result.source).toBe("unrestricted");
      expect(result.skills).toEqual([]);
    });

    it("should return inherited when agent has no explicit skills", () => {
      manager.updateConfig({
        defaults: { skills: ["skill1", "skill2"] },
        list: [{ id: "agent1" }],
      });

      const result = manager.getEffectiveAllowlist("agent1");
      expect(result.source).toBe("inherited");
      expect(result.skills).toEqual(["skill1", "skill2"]);
    });

    it("should return explicit when agent has own skills", () => {
      manager.updateConfig({
        defaults: { skills: ["skill1"] },
        list: [{ id: "agent1", skills: ["skill2", "skill3"] }],
      });

      const result = manager.getEffectiveAllowlist("agent1");
      expect(result.source).toBe("explicit");
      expect(result.skills).toEqual(["skill2", "skill3"]);
    });
  });

  describe("isSkillVisible", () => {
    it("should return true when unrestricted", () => {
      expect(manager.isSkillVisible("any-skill", "any-agent")).toBe(true);
    });

    it("should return true when skill is in allowlist", () => {
      manager.updateConfig({
        list: [{ id: "agent1", skills: ["skill1", "skill2"] }],
      });

      expect(manager.isSkillVisible("skill1", "agent1")).toBe(true);
      expect(manager.isSkillVisible("skill2", "agent1")).toBe(true);
      expect(manager.isSkillVisible("skill3", "agent1")).toBe(false);
    });
  });

  describe("filterSkills", () => {
    it("should filter skills correctly", () => {
      manager.updateConfig({
        list: [{ id: "agent1", skills: ["skill1", "skill2"] }],
      });

      const result = manager.filterSkills(
        ["skill1", "skill2", "skill3", "skill4"],
        "agent1"
      );

      expect(result.allowed).toEqual(["skill1", "skill2"]);
      expect(result.rejected).toHaveLength(2);
      expect(result.rejected[0].skill).toBe("skill3");
    });
  });

  describe("addSkillToAgent", () => {
    it("should add skill to agent", () => {
      manager.updateConfig({
        list: [{ id: "agent1", skills: [] }],
      });

      const result = manager.addSkillToAgent("agent1", "new-skill");
      expect(result).toBe(true);

      const effective = manager.getEffectiveAllowlist("agent1");
      expect(effective.skills).toContain("new-skill");
    });

    it("should return false for unknown agent", () => {
      const result = manager.addSkillToAgent("unknown", "skill");
      expect(result).toBe(false);
    });
  });

  describe("removeSkillFromAgent", () => {
    it("should remove skill from agent", () => {
      manager.updateConfig({
        list: [{ id: "agent1", skills: ["skill1", "skill2"] }],
      });

      const result = manager.removeSkillFromAgent("agent1", "skill1");
      expect(result).toBe(true);

      const effective = manager.getEffectiveAllowlist("agent1");
      expect(effective.skills).not.toContain("skill1");
      expect(effective.skills).toContain("skill2");
    });
  });

  describe("clearAgentSkills", () => {
    it("should clear all skills from agent", () => {
      manager.updateConfig({
        list: [{ id: "agent1", skills: ["skill1", "skill2"] }],
      });

      const result = manager.clearAgentSkills("agent1");
      expect(result).toBe(true);

      const effective = manager.getEffectiveAllowlist("agent1");
      expect(effective.skills).toEqual([]);
    });
  });

  describe("resetAgentSkills", () => {
    it("should reset agent to inherit defaults", () => {
      manager.updateConfig({
        defaults: { skills: ["default-skill"] },
        list: [{ id: "agent1", skills: ["skill1"] }],
      });

      const result = manager.resetAgentSkills("agent1");
      expect(result).toBe(true);

      const effective = manager.getEffectiveAllowlist("agent1");
      expect(effective.source).toBe("inherited");
      expect(effective.skills).toEqual(["default-skill"]);
    });
  });

  describe("exportConfig", () => {
    it("should export current config", () => {
      manager.updateConfig({
        defaults: { skills: ["skill1"] },
        list: [{ id: "agent1", skills: ["skill2"] }],
      });

      const exported = manager.exportConfig();
      expect(exported.defaults?.skills).toEqual(["skill1"]);
      expect(exported.list).toHaveLength(1);
    });
  });
});