/**
 * 技能来源追踪测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  SkillOriginTracker,
  createSkillOrigin,
  calculateSha256,
  resetSkillOriginTracker,
} from "../lifecycle/skill-origin.js";

describe("SkillOriginTracker", () => {
  let tracker: SkillOriginTracker;
  let tempDir: string;

  beforeEach(async () => {
    resetSkillOriginTracker();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-origin-"));
    tracker = new SkillOriginTracker(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("writeOrigin / readOrigin", () => {
    it("should write and read origin", async () => {
      const origin = createSkillOrigin("clawhub", "weather", "1.0.0", {
        registry: "https://clawhub.com",
        ownerHandle: "openclaw",
      });

      await tracker.writeOrigin("weather", origin);
      const read = await tracker.readOrigin("weather");

      expect(read).not.toBeNull();
      expect(read?.slug).toBe("weather");
      expect(read?.installedVersion).toBe("1.0.0");
      expect(read?.sourceType).toBe("clawhub");
    });

    it("should return null for non-existent origin", async () => {
      const origin = await tracker.readOrigin("non-existent");
      expect(origin).toBeNull();
    });
  });

  describe("deleteOrigin", () => {
    it("should delete origin", async () => {
      const origin = createSkillOrigin("local", "test-skill", "1.0.0");
      await tracker.writeOrigin("test-skill", origin);

      const deleted = await tracker.deleteOrigin("test-skill");
      expect(deleted).toBe(true);

      const read = await tracker.readOrigin("test-skill");
      expect(read).toBeNull();
    });

    it("should return false for non-existent origin", async () => {
      const deleted = await tracker.deleteOrigin("non-existent");
      expect(deleted).toBe(false);
    });
  });

  describe("listTrackedSkills", () => {
    it("should list tracked skills", async () => {
      await tracker.writeOrigin("skill1", createSkillOrigin("local", "skill1", "1.0.0"));
      await tracker.writeOrigin("skill2", createSkillOrigin("clawhub", "skill2", "2.0.0"));

      const skills = await tracker.listTrackedSkills();
      expect(skills).toContain("skill1");
      expect(skills).toContain("skill2");
    });
  });

  describe("trackInstallation", () => {
    it("should track installation", async () => {
      const origin = createSkillOrigin("clawhub", "weather", "1.0.0");
      const record = await tracker.trackInstallation("weather", origin);

      expect(record.action).toBe("install");
      expect(record.success).toBe(true);
      expect(record.newVersion).toBe("1.0.0");
    });
  });

  describe("readHistory", () => {
    it("should read installation history", async () => {
      const origin = createSkillOrigin("local", "test-skill", "1.0.0");
      await tracker.trackInstallation("test-skill", origin);

      const history = await tracker.readHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[history.length - 1].action).toBe("install");
    });
  });
});

describe("Helpers", () => {
  describe("calculateSha256", () => {
    it("should calculate SHA256", () => {
      const hash = calculateSha256("test content");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("createSkillOrigin", () => {
    it("should create origin with defaults", () => {
      const origin = createSkillOrigin("local", "test-skill", "1.0.0");

      expect(origin.version).toBe(1);
      expect(origin.sourceType).toBe("local");
      expect(origin.slug).toBe("test-skill");
      expect(origin.installedVersion).toBe("1.0.0");
      expect(origin.installedAt).toBeLessThanOrEqual(Date.now());
    });

    it("should merge options", () => {
      const origin = createSkillOrigin("clawhub", "weather", "1.0.0", {
        registry: "https://clawhub.com",
        ownerHandle: "openclaw",
      });

      expect(origin.registry).toBe("https://clawhub.com");
      expect(origin.ownerHandle).toBe("openclaw");
    });
  });
});