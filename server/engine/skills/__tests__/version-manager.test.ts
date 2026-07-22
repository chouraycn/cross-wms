import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  parseVersion,
  compareVersions,
  satisfiesVersion,
  installVersion,
  getVersions,
  getCurrentVersion,
  switchVersion,
  rollbackVersion,
  lockVersion,
  unlockVersion,
  getVersionLock,
  upgradeSkill,
  versionExists,
  uninstallVersion,
  type SkillVersion,
  type VersionLock,
  type VersionUpgradeResult,
} from "../lifecycle/version-manager.js";

describe("版本解析与比较", () => {
  describe("parseVersion", () => {
    it("应解析标准 SemVer", () => {
      const r = parseVersion("1.2.3");
      expect(r).not.toBeNull();
      expect(r?.major).toBe(1);
      expect(r?.minor).toBe(2);
      expect(r?.patch).toBe(3);
    });

    it("应解析带 v 前缀的版本", () => {
      const r = parseVersion("v2.0.0");
      expect(r?.major).toBe(2);
    });

    it("应解析 prerelease 版本", () => {
      const r = parseVersion("1.0.0-alpha.1");
      expect(r?.prerelease).toBe("alpha.1");
    });

    it("应解析 build metadata", () => {
      const r = parseVersion("1.0.0+build.123");
      expect(r?.build).toBe("build.123");
    });

    it("无效格式应返回 null", () => {
      expect(parseVersion("invalid")).toBeNull();
      expect(parseVersion("1.2")).toBeNull();
      expect(parseVersion("a.b.c")).toBeNull();
    });
  });

  describe("compareVersions", () => {
    it("应比较主版本号", () => {
      expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
      expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
    });

    it("应比较次版本号", () => {
      expect(compareVersions("1.0.0", "1.1.0")).toBe(-1);
    });

    it("应比较修订号", () => {
      expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
    });

    it("相等版本应返回 0", () => {
      expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    });

    it("prerelease 版本低于正式版本", () => {
      expect(compareVersions("1.0.0-alpha.1", "1.0.0")).toBe(-1);
    });
  });

  describe("satisfiesVersion", () => {
    it("应匹配精确版本", () => {
      expect(satisfiesVersion("1.2.3", { exact: "1.2.3" })).toBe(true);
      expect(satisfiesVersion("1.2.3", { exact: "1.2.4" })).toBe(false);
    });

    it("应匹配最小版本", () => {
      expect(satisfiesVersion("1.2.3", { min: "1.0.0" })).toBe(true);
      expect(satisfiesVersion("0.9.0", { min: "1.0.0" })).toBe(false);
    });

    it("应匹配最大版本", () => {
      expect(satisfiesVersion("1.2.3", { max: "2.0.0" })).toBe(true);
      expect(satisfiesVersion("2.1.0", { max: "2.0.0" })).toBe(false);
    });

    it("应匹配版本范围", () => {
      expect(satisfiesVersion("1.5.0", { min: "1.0.0", max: "2.0.0" })).toBe(true);
      expect(satisfiesVersion("0.9.0", { min: "1.0.0", max: "2.0.0" })).toBe(false);
      expect(satisfiesVersion("2.1.0", { min: "1.0.0", max: "2.0.0" })).toBe(false);
    });
  });
});

describe("版本管理功能", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "version-manager-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function installTestVersion(
    baseDir: string,
    skillName: string,
    version: string,
    content: string = "test",
  ): Promise<SkillVersion | null> {
    const result = await installVersion(baseDir, skillName, version);
    if (result) {
      await fs.writeFile(path.join(result.path, "SKILL.md"), content, "utf-8");
      await installVersion(baseDir, skillName, version, { force: true });
    }
    return await installVersion(baseDir, skillName, version);
  }

  describe("installVersion", () => {
    it("应安装版本", async () => {
      const result = await installTestVersion(tempDir, "test-skill", "1.0.0");
      expect(result).not.toBeNull();
      expect(result?.version).toBe("1.0.0");
      expect(result?.sha256).toBeDefined();
    });

    it("无效版本格式应返回 null", async () => {
      const result = await installVersion(tempDir, "test-skill", "invalid");
      expect(result).toBeNull();
    });

    it("已安装版本不应重复安装（无 force）", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0", "content1");
      const result = await installVersion(tempDir, "test-skill", "1.0.0");
      expect(result).not.toBeNull();
    });

    it("force 应覆盖已安装版本（删除并重新创建）", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0", "content1");
      expect(await versionExists(tempDir, "test-skill", "1.0.0")).toBe(true);
      await installVersion(tempDir, "test-skill", "1.0.0", { force: true });
      expect(await versionExists(tempDir, "test-skill", "1.0.0")).toBe(true);
    });
  });

  describe("getVersions", () => {
    it("应返回所有版本", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      await installTestVersion(tempDir, "test-skill", "1.1.0");
      await installTestVersion(tempDir, "test-skill", "2.0.0");

      const versions = await getVersions(tempDir, "test-skill");
      expect(versions.length).toBe(3);
      expect(versions.map((v) => v.version)).toEqual(["1.0.0", "1.1.0", "2.0.0"]);
    });

    it("不存在的技能应返回空数组", async () => {
      const versions = await getVersions(tempDir, "nonexistent");
      expect(versions).toEqual([]);
    });
  });

  describe("getCurrentVersion", () => {
    it("应返回最新版本（无 current 链接时）", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      await installTestVersion(tempDir, "test-skill", "2.0.0");

      const current = await getCurrentVersion(tempDir, "test-skill");
      expect(current?.version).toBe("2.0.0");
    });

    it("应返回 current 链接指向的版本", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      await installTestVersion(tempDir, "test-skill", "2.0.0");
      await switchVersion(tempDir, "test-skill", "1.0.0");

      const current = await getCurrentVersion(tempDir, "test-skill");
      expect(current?.version).toBe("1.0.0");
    });

    it("不存在的技能应返回 null", async () => {
      const current = await getCurrentVersion(tempDir, "nonexistent");
      expect(current).toBeNull();
    });
  });

  describe("switchVersion", () => {
    it("应切换版本", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      await installTestVersion(tempDir, "test-skill", "2.0.0");

      const result = await switchVersion(tempDir, "test-skill", "1.0.0");
      expect(result).toBe(true);

      const current = await getCurrentVersion(tempDir, "test-skill");
      expect(current?.version).toBe("1.0.0");
    });

    it("切换不存在的版本应失败", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      const result = await switchVersion(tempDir, "test-skill", "9.9.9");
      expect(result).toBe(false);
    });

    it("锁定时切换到其他版本应失败", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      await installTestVersion(tempDir, "test-skill", "2.0.0");
      await lockVersion(tempDir, "test-skill", "1.0.0");

      const result = await switchVersion(tempDir, "test-skill", "2.0.0");
      expect(result).toBe(false);
    });
  });

  describe("rollbackVersion", () => {
    it("应回滚一个版本", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      await installTestVersion(tempDir, "test-skill", "1.1.0");
      await installTestVersion(tempDir, "test-skill", "2.0.0");
      await switchVersion(tempDir, "test-skill", "2.0.0");

      const rolledBack = await rollbackVersion(tempDir, "test-skill");
      expect(rolledBack?.version).toBe("1.1.0");
    });

    it("应回滚多个版本", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      await installTestVersion(tempDir, "test-skill", "1.1.0");
      await installTestVersion(tempDir, "test-skill", "2.0.0");
      await switchVersion(tempDir, "test-skill", "2.0.0");

      const rolledBack = await rollbackVersion(tempDir, "test-skill", 2);
      expect(rolledBack?.version).toBe("1.0.0");
    });

    it("没有版本时应返回 null", async () => {
      const result = await rollbackVersion(tempDir, "test-skill");
      expect(result).toBeNull();
    });
  });

  describe("版本锁定", () => {
    it("应锁定版本", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      const result = await lockVersion(tempDir, "test-skill", "1.0.0", "testing");
      expect(result).toBe(true);

      const lock = await getVersionLock(tempDir, "test-skill");
      expect(lock?.lockedVersion).toBe("1.0.0");
      expect(lock?.reason).toBe("testing");
    });

    it("锁定不存在的版本应失败", async () => {
      const result = await lockVersion(tempDir, "test-skill", "1.0.0");
      expect(result).toBe(false);
    });

    it("应解锁版本", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      await lockVersion(tempDir, "test-skill", "1.0.0");

      const result = await unlockVersion(tempDir, "test-skill");
      expect(result).toBe(true);

      const lock = await getVersionLock(tempDir, "test-skill");
      expect(lock).toBeNull();
    });
  });

  describe("upgradeSkill", () => {
    it("应升级到最新稳定版本", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      await installTestVersion(tempDir, "test-skill", "2.0.0");
      await switchVersion(tempDir, "test-skill", "1.0.0");

      const result = await upgradeSkill(tempDir, "test-skill");
      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe("1.0.0");
      expect(result.toVersion).toBe("2.0.0");
    });

    it("锁定时应阻止升级", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      await installTestVersion(tempDir, "test-skill", "2.0.0");
      await lockVersion(tempDir, "test-skill", "1.0.0");

      const result = await upgradeSkill(tempDir, "test-skill");
      expect(result.success).toBe(false);
      expect(result.error).toContain("locked");
    });

    it("已是最新版本应返回失败", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      await installTestVersion(tempDir, "test-skill", "2.0.0");
      await switchVersion(tempDir, "test-skill", "2.0.0");

      const result = await upgradeSkill(tempDir, "test-skill");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Already at latest version");
    });

    it("应优先选择稳定版本", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      await installTestVersion(tempDir, "test-skill", "2.0.0-alpha.1");

      const result = await upgradeSkill(tempDir, "test-skill");
      expect(result.toVersion).toBe("1.0.0");
    });

    it("没有稳定版本时应选择最新预发布版本", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0-alpha.1");
      await installTestVersion(tempDir, "test-skill", "1.0.0-alpha.2");

      const result = await upgradeSkill(tempDir, "test-skill");
      expect(result.toVersion).toBe("1.0.0-alpha.2");
    });
  });

  describe("versionExists", () => {
    it("应检测已安装版本", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      expect(await versionExists(tempDir, "test-skill", "1.0.0")).toBe(true);
      expect(await versionExists(tempDir, "test-skill", "9.9.9")).toBe(false);
    });
  });

  describe("uninstallVersion", () => {
    it("应卸载版本", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      await installTestVersion(tempDir, "test-skill", "2.0.0");
      await switchVersion(tempDir, "test-skill", "2.0.0");

      const result = await uninstallVersion(tempDir, "test-skill", "1.0.0");
      expect(result).toBe(true);
      expect(await versionExists(tempDir, "test-skill", "1.0.0")).toBe(false);
    });

    it("不应卸载当前版本", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      await installTestVersion(tempDir, "test-skill", "2.0.0");
      await switchVersion(tempDir, "test-skill", "1.0.0");

      const result = await uninstallVersion(tempDir, "test-skill", "1.0.0");
      expect(result).toBe(false);
    });

    it("不应卸载锁定版本", async () => {
      await installTestVersion(tempDir, "test-skill", "1.0.0");
      await lockVersion(tempDir, "test-skill", "1.0.0");

      const result = await uninstallVersion(tempDir, "test-skill", "1.0.0");
      expect(result).toBe(false);
    });
  });

  describe("完整生命周期", () => {
    it("安装、切换、升级、回滚、锁定的完整流程", async () => {
      await installTestVersion(tempDir, "my-skill", "1.0.0");
      await installTestVersion(tempDir, "my-skill", "1.1.0");
      await installTestVersion(tempDir, "my-skill", "2.0.0");

      let current = await getCurrentVersion(tempDir, "my-skill");
      expect(current?.version).toBe("2.0.0");

      await switchVersion(tempDir, "my-skill", "1.0.0");
      current = await getCurrentVersion(tempDir, "my-skill");
      expect(current?.version).toBe("1.0.0");

      await upgradeSkill(tempDir, "my-skill");
      current = await getCurrentVersion(tempDir, "my-skill");
      expect(current?.version).toBe("2.0.0");

      await rollbackVersion(tempDir, "my-skill");
      current = await getCurrentVersion(tempDir, "my-skill");
      expect(current?.version).toBe("1.1.0");

      await lockVersion(tempDir, "my-skill", "1.1.0");
      const lock = await getVersionLock(tempDir, "my-skill");
      expect(lock?.lockedVersion).toBe("1.1.0");

      const upgradeResult = await upgradeSkill(tempDir, "my-skill");
      expect(upgradeResult.success).toBe(false);

      await unlockVersion(tempDir, "my-skill");
      await upgradeSkill(tempDir, "my-skill");
      current = await getCurrentVersion(tempDir, "my-skill");
      expect(current?.version).toBe("2.0.0");
    });
  });
});
