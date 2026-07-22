/**
 * 技能验证器和诊断系统测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  validateSkillName,
  validateSkillDescription,
  validateSkillSummary,
  validateSkillVersion,
  validateSkillSlug,
  DiagnosticCollector,
  createLoadResult,
  loadSkillSafely,
} from "../loading/skill-diagnostics.js";

describe("Skill Validators", () => {
  describe("validateSkillName", () => {
    it("should accept valid names", () => {
      expect(validateSkillName("weather").valid).toBe(true);
      expect(validateSkillName("1password").valid).toBe(true);
      expect(validateSkillName("skill-creator").valid).toBe(true);
      expect(validateSkillName("a").valid).toBe(true);
    });

    it("should reject empty name", () => {
      const result = validateSkillName("");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Skill name is required");
    });

    it("should reject names with uppercase", () => {
      const result = validateSkillName("Weather");
      expect(result.valid).toBe(false);
    });

    it("should reject names with special characters", () => {
      expect(validateSkillName("weather!").valid).toBe(false);
      expect(validateSkillName("weather_skill").valid).toBe(false);
      expect(validateSkillName("weather.skill").valid).toBe(false);
    });

    it("should reject names with consecutive hyphens", () => {
      const result = validateSkillName("weather--skill");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Skill name must not contain consecutive hyphens");
    });

    it("should reject names starting or ending with hyphen", () => {
      expect(validateSkillName("-weather").valid).toBe(false);
      expect(validateSkillName("weather-").valid).toBe(false);
    });

    it("should reject names exceeding 64 characters", () => {
      const longName = "a".repeat(65);
      const result = validateSkillName(longName);
      expect(result.valid).toBe(false);
    });
  });

  describe("validateSkillDescription", () => {
    it("should accept valid description", () => {
      const result = validateSkillDescription("A weather skill");
      expect(result.valid).toBe(true);
    });

    it("should reject empty description", () => {
      const result = validateSkillDescription("");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Skill description is required");
    });

    it("should reject description exceeding 1024 characters", () => {
      const longDesc = "a".repeat(1025);
      const result = validateSkillDescription(longDesc);
      expect(result.valid).toBe(false);
    });
  });

  describe("validateSkillVersion", () => {
    it("should accept valid semver versions", () => {
      expect(validateSkillVersion("1.0.0").valid).toBe(true);
      expect(validateSkillVersion("0.1.0").valid).toBe(true);
      expect(validateSkillVersion("1.2.3").valid).toBe(true);
      expect(validateSkillVersion("1.0.0-beta.1").valid).toBe(true);
      expect(validateSkillVersion("1.0.0+build.1").valid).toBe(true);
    });

    it("should reject invalid versions", () => {
      expect(validateSkillVersion("").valid).toBe(false);
      expect(validateSkillVersion("1").valid).toBe(false);
      expect(validateSkillVersion("1.0").valid).toBe(false);
      expect(validateSkillVersion("v1.0.0").valid).toBe(false);
      expect(validateSkillVersion("latest").valid).toBe(false);
    });
  });

  describe("validateSkillSlug", () => {
    it("should accept valid slugs", () => {
      expect(validateSkillSlug("weather").valid).toBe(true);
      expect(validateSkillSlug("openclaw/weather").valid).toBe(true);
      expect(validateSkillSlug("@openclaw/weather").valid).toBe(true);
    });

    it("should reject invalid slugs", () => {
      expect(validateSkillSlug("").valid).toBe(false);
      expect(validateSkillSlug("Weather").valid).toBe(false);
      expect(validateSkillSlug("weather!").valid).toBe(false);
    });
  });
});

describe("DiagnosticCollector", () => {
  let collector: DiagnosticCollector;

  beforeEach(() => {
    collector = new DiagnosticCollector();
  });

  it("should add diagnostics", () => {
    collector.addError("skill1", "Name is required");
    collector.addWarning("skill1", "Description is too short");
    collector.addInfo("skill1", "Using default version");

    expect(collector.count()).toBe(3);
    expect(collector.getErrors()).toHaveLength(1);
    expect(collector.getWarnings()).toHaveLength(1);
    expect(collector.hasErrors()).toBe(true);
    expect(collector.hasWarnings()).toBe(true);
  });

  it("should clear diagnostics", () => {
    collector.addError("skill1", "Error");
    collector.clear();
    expect(collector.count()).toBe(0);
  });

  it("should format report", () => {
    collector.addError("skill1", "Name is required", { suggestion: "Provide a name" });
    collector.addWarning("skill1", "Description is short");

    const report = collector.formatReport();
    expect(report).toContain("ERROR");
    expect(report).toContain("WARNING");
    expect(report).toContain("Name is required");
    expect(report).toContain("Provide a name");
  });

  it("should validate skill and collect diagnostics", () => {
    const valid = collector.validateSkill({
      name: "weather",
      description: "A weather skill",
      version: "1.0.0",
    });

    expect(valid).toBe(true);
    expect(collector.count()).toBe(0);
  });

  it("should collect errors for invalid skill", () => {
    const valid = collector.validateSkill({
      name: "Weather!",
      description: "",
      version: "latest",
    });

    expect(valid).toBe(false);
    expect(collector.getErrors().length).toBeGreaterThan(0);
  });
});

describe("Load Result Helpers", () => {
  it("createLoadResult should create proper result", () => {
    const collector = new DiagnosticCollector();
    collector.addWarning("skill1", "Minor issue");

    const result = createLoadResult([{ name: "skill1" }], collector);

    expect(result.skills).toHaveLength(1);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.hasErrors).toBe(false);
    expect(result.hasWarnings).toBe(true);
  });

  it("loadSkillSafely should handle success", async () => {
    const { skill, diagnostics } = await loadSkillSafely(
      async () => ({ name: "weather" }),
      "weather"
    );

    expect(skill).toEqual({ name: "weather" });
    expect(diagnostics).toHaveLength(0);
  });

  it("loadSkillSafely should handle errors", async () => {
    const { skill, diagnostics } = await loadSkillSafely(
      async () => {
        throw new Error("File not found");
      },
      "missing-skill"
    );

    expect(skill).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].level).toBe("error");
    expect(diagnostics[0].message).toContain("File not found");
  });
});