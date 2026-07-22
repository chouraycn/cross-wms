import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  searchClawHubSkills,
  fetchClawHubSkillDetail,
  fetchClawHubSkillVerification,
  installSkillFromClawHub,
  updateSkillsFromClawHub,
  readTrackedClawHubSkillSlugs,
  writeClawHubOrigin,
  readClawHubOrigin,
  type ClawHubSkillOrigin,
} from "../lifecycle/clawhub.js";

describe("clawhub", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawhub-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("searchClawHubSkills", () => {
    it("应该返回所有技能（无查询）", () => {
      const results = searchClawHubSkills();
      expect(results.length).toBe(10);
    });

    it("应该按 slug 搜索技能", () => {
      const results = searchClawHubSkills("weather");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].slug).toBe("weather");
    });

    it("应该按显示名称搜索", () => {
      const results = searchClawHubSkills("Diagram Maker");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].slug).toBe("diagram-maker");
    });

    it("应该按标签搜索", () => {
      const results = searchClawHubSkills("productivity");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("应该遵守 limit 参数", () => {
      const results = searchClawHubSkills(undefined, 3);
      expect(results.length).toBe(3);
    });

    it("应该返回正确的字段", () => {
      const results = searchClawHubSkills("github");
      expect(results[0]).toHaveProperty("slug");
      expect(results[0]).toHaveProperty("displayName");
      expect(results[0]).toHaveProperty("version");
      expect(results[0]).toHaveProperty("summary");
      expect(results[0]).toHaveProperty("ownerHandle");
    });

    it("应该包含指定的 10 个技能", () => {
      const results = searchClawHubSkills();
      const slugs = results.map((r) => r.slug);
      expect(slugs).toContain("weather");
      expect(slugs).toContain("1password");
      expect(slugs).toContain("obsidian");
      expect(slugs).toContain("diagram-maker");
      expect(slugs).toContain("notion");
      expect(slugs).toContain("github");
      expect(slugs).toContain("spotify-player");
      expect(slugs).toContain("himalaya");
      expect(slugs).toContain("nano-pdf");
      expect(slugs).toContain("skill-creator");
    });
  });

  describe("fetchClawHubSkillDetail", () => {
    it("应该返回存在的技能详情", () => {
      const detail = fetchClawHubSkillDetail("weather");
      expect(detail).not.toBeNull();
      expect(detail?.slug).toBe("weather");
      expect(detail?.displayName).toBe("Weather");
      expect(detail?.description).toBeDefined();
      expect(detail?.latestVersion).toBeDefined();
      expect(detail?.tags).toBeInstanceOf(Array);
      expect(detail?.downloadCount).toBeGreaterThan(0);
    });

    it("对于不存在的技能应该返回 null", () => {
      const detail = fetchClawHubSkillDetail("nonexistent-skill");
      expect(detail).toBeNull();
    });
  });

  describe("fetchClawHubSkillVerification", () => {
    it("应该对可信发布者返回 trusted 决策", () => {
      const result = fetchClawHubSkillVerification("github");
      expect(result.ok).toBe(true);
      expect(result.decision).toBe("trusted");
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it("应该对社区发布者返回 warn 决策", () => {
      const result = fetchClawHubSkillVerification("obsidian");
      expect(result.ok).toBe(true);
      expect(result.decision).toBe("warn");
    });

    it("对不存在的技能应该返回 rejected", () => {
      const result = fetchClawHubSkillVerification("nonexistent");
      expect(result.ok).toBe(false);
      expect(result.decision).toBe("rejected");
    });

    it("应该包含验证字段", () => {
      const result = fetchClawHubSkillVerification("weather");
      expect(result).toHaveProperty("schema");
      expect(result).toHaveProperty("card");
      expect(result).toHaveProperty("artifact");
      expect(result).toHaveProperty("provenance");
      expect(result).toHaveProperty("security");
      expect(result).toHaveProperty("signature");
    });

    it("应该接受可选的版本参数", () => {
      const result = fetchClawHubSkillVerification("weather", "1.2.0");
      expect(result.ok).toBe(true);
      expect(result.card).toBeDefined();
    });
  });

  describe("installSkillFromClawHub", () => {
    it("应该安装技能到指定目录", async () => {
      const result = await installSkillFromClawHub(tmpDir, "weather");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.slug).toBe("weather");
        expect(result.version).toBe("1.2.0");
        expect(result.targetDir).toBe(path.join(tmpDir, "skills", "weather"));

        const skillMdPath = path.join(result.targetDir, "SKILL.md");
        const stat = await fs.stat(skillMdPath);
        expect(stat.isFile()).toBe(true);
      }
    });

    it("应该创建 .clawhub/origin.json 文件", async () => {
      const result = await installSkillFromClawHub(tmpDir, "weather");
      expect(result.ok).toBe(true);
      if (result.ok) {
        const originPath = path.join(result.targetDir, ".clawhub", "origin.json");
        const stat = await fs.stat(originPath);
        expect(stat.isFile()).toBe(true);
      }
    });

    it("应该创建工作区锁文件", async () => {
      await installSkillFromClawHub(tmpDir, "weather");
      const lockPath = path.join(tmpDir, ".clawhub", "lock.json");
      const stat = await fs.stat(lockPath);
      expect(stat.isFile()).toBe(true);
    });

    it("默认情况下不应覆盖现有技能", async () => {
      await installSkillFromClawHub(tmpDir, "weather");
      const result = await installSkillFromClawHub(tmpDir, "weather");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("already exists");
      }
    });

    it("使用 force=true 应该覆盖现有技能", async () => {
      await installSkillFromClawHub(tmpDir, "weather");
      const result = await installSkillFromClawHub(tmpDir, "weather", undefined, true);
      expect(result.ok).toBe(true);
    });

    it("应该安装指定版本的技能", async () => {
      const result = await installSkillFromClawHub(tmpDir, "weather", "1.2.0");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.version).toBe("1.2.0");
      }
    });

    it("对于不存在的技能应该返回错误", async () => {
      const result = await installSkillFromClawHub(tmpDir, "nonexistent-skill");
      expect(result.ok).toBe(false);
    });
  });

  describe("readTrackedClawHubSkillSlugs", () => {
    it("对于空工作区应该返回空数组", async () => {
      const slugs = await readTrackedClawHubSkillSlugs(tmpDir);
      expect(slugs).toEqual([]);
    });

    it("应该返回已安装技能的 slugs", async () => {
      await installSkillFromClawHub(tmpDir, "weather");
      await installSkillFromClawHub(tmpDir, "github");
      const slugs = await readTrackedClawHubSkillSlugs(tmpDir);
      expect(slugs).toEqual(["github", "weather"]);
    });
  });

  describe("writeClawHubOrigin / readClawHubOrigin", () => {
    it("应该写入并读取 origin 文件", async () => {
      const skillDir = path.join(tmpDir, "skills", "test-skill");
      const origin: ClawHubSkillOrigin = {
        version: 1,
        registry: "https://clawhub.com",
        slug: "test-skill",
        ownerHandle: "test-owner",
        installedVersion: "1.0.0",
        installedAt: 1234567890,
        sourceUrl: "https://github.com/test/test-skill",
        sha256: "abc123",
      };

      await writeClawHubOrigin(skillDir, origin);
      const readBack = await readClawHubOrigin(skillDir);

      expect(readBack).not.toBeNull();
      expect(readBack?.slug).toBe("test-skill");
      expect(readBack?.ownerHandle).toBe("test-owner");
      expect(readBack?.installedVersion).toBe("1.0.0");
      expect(readBack?.installedAt).toBe(1234567890);
      expect(readBack?.sourceUrl).toBe("https://github.com/test/test-skill");
      expect(readBack?.sha256).toBe("abc123");
    });

    it("对于不存在的 origin 文件应该返回 null", async () => {
      const skillDir = path.join(tmpDir, "skills", "nonexistent");
      const origin = await readClawHubOrigin(skillDir);
      expect(origin).toBeNull();
    });
  });

  describe("updateSkillsFromClawHub", () => {
    it("应该更新单个指定的技能", async () => {
      await installSkillFromClawHub(tmpDir, "weather");
      const results = await updateSkillsFromClawHub(tmpDir, "weather");
      expect(results.length).toBe(1);
      expect(results[0].ok).toBe(true);
    });

    it("对于未追踪的技能应该返回错误", async () => {
      const results = await updateSkillsFromClawHub(tmpDir, "weather");
      expect(results.length).toBe(1);
      expect(results[0].ok).toBe(false);
    });

    it("应该更新所有已追踪的技能", async () => {
      await installSkillFromClawHub(tmpDir, "weather");
      await installSkillFromClawHub(tmpDir, "github");
      const results = await updateSkillsFromClawHub(tmpDir);
      expect(results.length).toBe(2);
      expect(results.every((r) => r.ok)).toBe(true);
    });

    it("对于已是最新版本应该返回 changed=false", async () => {
      await installSkillFromClawHub(tmpDir, "weather");
      const results = await updateSkillsFromClawHub(tmpDir);
      const weatherResult = results.find((r) => r.ok && r.slug === "weather");
      if (weatherResult && weatherResult.ok) {
        expect(weatherResult.changed).toBe(false);
      }
    });
  });
});
