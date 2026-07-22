/**
 * 技能沙箱隔离系统测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  sanitizeEnvVars,
  validateEnvVarValue,
  isInsideSandbox,
  assertInsideSandbox,
  resolveSandboxPath,
  syncSkillToSandbox,
  cleanSandbox,
  getSandboxSkillsDir,
  SkillEnvTracker,
  resetSkillEnvTracker,
} from "../security/sandbox.js";

describe("Sandbox: Environment Variable Sanitization", () => {
  describe("validateEnvVarValue", () => {
    it("should allow safe values", () => {
      const result = validateEnvVarValue("API_KEY", "abc123");
      expect(result.valid).toBe(true);
    });

    it("should reject dangerous variables", () => {
      expect(validateEnvVarValue("LD_PRELOAD", "/lib/evil.so").valid).toBe(false);
      expect(validateEnvVarValue("OPENSSL_CONF", "/etc/evil.cnf").valid).toBe(false);
      expect(validateEnvVarValue("NODE_OPTIONS", "--inspect").valid).toBe(false);
      expect(validateEnvVarValue("BASH_ENV", "/etc/evil.sh").valid).toBe(false);
    });

    it("should reject path traversal in values", () => {
      expect(validateEnvVarValue("PATH", "../../etc/passwd").valid).toBe(false);
      expect(validateEnvVarValue("DATA", "value\0injected").valid).toBe(false);
    });

    it("should reject command injection patterns", () => {
      expect(validateEnvVarValue("CMD", "`rm -rf /`").valid).toBe(false);
      expect(validateEnvVarValue("CMD", "$(cat /etc/passwd)").valid).toBe(false);
      expect(validateEnvVarValue("CMD", "ls; rm -rf /").valid).toBe(false);
    });
  });

  describe("sanitizeEnvVars", () => {
    it("should remove dangerous variables", () => {
      const result = sanitizeEnvVars({
        API_KEY: "abc123",
        LD_PRELOAD: "/lib/evil.so",
        NODE_OPTIONS: "--inspect",
        PATH: "/usr/bin",
      });

      expect(result.sanitized.API_KEY).toBe("abc123");
      expect(result.sanitized.PATH).toBe("/usr/bin");
      expect(result.sanitized.LD_PRELOAD).toBeUndefined();
      expect(result.sanitized.NODE_OPTIONS).toBeUndefined();
      expect(result.removed).toHaveLength(2);
    });

    it("should allow all safe variables", () => {
      const result = sanitizeEnvVars({
        HOME: "/home/user",
        USER: "test",
        LANG: "en_US.UTF-8",
      });

      expect(Object.keys(result.sanitized)).toHaveLength(3);
      expect(result.removed).toHaveLength(0);
    });
  });
});

describe("Sandbox: Path Security", () => {
  const sandboxRoot = "/tmp/sandbox-test";

  describe("isInsideSandbox", () => {
    it("should return true for paths inside sandbox", () => {
      expect(isInsideSandbox("/tmp/sandbox-test/skills", sandboxRoot)).toBe(true);
      expect(isInsideSandbox("/tmp/sandbox-test/skills/weather/SKILL.md", sandboxRoot)).toBe(true);
    });

    it("should return false for paths outside sandbox", () => {
      expect(isInsideSandbox("/etc/passwd", sandboxRoot)).toBe(false);
      expect(isInsideSandbox("/tmp/other", sandboxRoot)).toBe(false);
      expect(isInsideSandbox("../../etc", sandboxRoot)).toBe(false);
    });
  });

  describe("assertInsideSandbox", () => {
    it("should not throw for paths inside sandbox", () => {
      expect(() => assertInsideSandbox("/tmp/sandbox-test/skills", sandboxRoot)).not.toThrow();
    });

    it("should throw for paths outside sandbox", () => {
      expect(() => assertInsideSandbox("/etc/passwd", sandboxRoot)).toThrow("escapes sandbox");
    });
  });

  describe("resolveSandboxPath", () => {
    it("should resolve paths inside sandbox", () => {
      const result = resolveSandboxPath(sandboxRoot, "skills", "weather");
      expect(result).toBe(path.resolve(sandboxRoot, "skills", "weather"));
    });

    it("should throw for path escape attempts", () => {
      expect(() => resolveSandboxPath(sandboxRoot, "..", "..", "etc")).toThrow();
    });
  });
});

describe("Sandbox: Workspace Sync", () => {
  let tempDir: string;
  let sourceDir: string;
  let targetDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sandbox-sync-"));
    sourceDir = path.join(tempDir, "source");
    targetDir = path.join(tempDir, "target");

    // 创建测试源目录结构
    await fs.mkdir(path.join(sourceDir, "subdir"), { recursive: true });
    await fs.writeFile(path.join(sourceDir, "SKILL.md"), "# Test Skill");
    await fs.writeFile(path.join(sourceDir, "config.json"), '{"test":true}');
    await fs.writeFile(path.join(sourceDir, "subdir", "helper.ts"), "export const x = 1;");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should sync files and directories", async () => {
    const result = await syncSkillToSandbox({
      sourceDir,
      targetDir,
    });

    expect(result.fileCount).toBe(3);
    expect(result.dirCount).toBeGreaterThanOrEqual(1);
    expect(result.errors).toHaveLength(0);

    // 验证文件已复制
    const skillMd = await fs.readFile(path.join(targetDir, "SKILL.md"), "utf8");
    expect(skillMd).toBe("# Test Skill");

    const config = await fs.readFile(path.join(targetDir, "config.json"), "utf8");
    expect(config).toBe('{"test":true}');
  });

  it("should skip existing files without overwrite", async () => {
    // 先同步一次
    await syncSkillToSandbox({ sourceDir, targetDir });

    // 修改源文件
    await fs.writeFile(path.join(sourceDir, "SKILL.md"), "# Updated Skill");

    // 再次同步（不覆盖）
    const result = await syncSkillToSandbox({
      sourceDir,
      targetDir,
      overwrite: false,
    });

    expect(result.skipped).toContain("SKILL.md");

    // 验证文件未被覆盖
    const skillMd = await fs.readFile(path.join(targetDir, "SKILL.md"), "utf8");
    expect(skillMd).toBe("# Test Skill");
  });

  it("should overwrite files with overwrite flag", async () => {
    await syncSkillToSandbox({ sourceDir, targetDir });
    await fs.writeFile(path.join(sourceDir, "SKILL.md"), "# Updated Skill");

    const result = await syncSkillToSandbox({
      sourceDir,
      targetDir,
      overwrite: true,
    });

    const skillMd = await fs.readFile(path.join(targetDir, "SKILL.md"), "utf8");
    expect(skillMd).toBe("# Updated Skill");
  });

  it("should exclude files matching patterns", async () => {
    const result = await syncSkillToSandbox({
      sourceDir,
      targetDir,
      excludePatterns: ["\\.json$"],
    });

    expect(result.skipped).toContain("config.json");
    expect(result.fileCount).toBe(2);

    // config.json 应该不存在
    await expect(fs.access(path.join(targetDir, "config.json"))).rejects.toThrow();
  });
});

describe("Sandbox: SkillEnvTracker", () => {
  beforeEach(() => {
    resetSkillEnvTracker();
  });

  it("should track and untrack env keys", () => {
    const tracker = new SkillEnvTracker();

    tracker.track("weather", "WEATHER_API_KEY");
    tracker.track("weather", "WEATHER_UNIT");
    tracker.track("github", "GITHUB_TOKEN");

    expect(tracker.getActiveEnvKeys()).toHaveLength(3);
    expect(tracker.getSkillEnvKeys("weather")).toHaveLength(2);
    expect(tracker.getSkillEnvKeys("github")).toHaveLength(1);
  });

  it("should handle reference counting", () => {
    const tracker = new SkillEnvTracker();

    tracker.track("skill1", "API_KEY");
    tracker.track("skill2", "API_KEY");

    expect(tracker.getActiveEnvKeys()).toEqual(["API_KEY"]);

    tracker.untrack("skill1", "API_KEY");

    // 仍然有一个引用
    expect(tracker.getActiveEnvKeys()).toEqual(["API_KEY"]);

    tracker.untrack("skill2", "API_KEY");

    // 所有引用都被移除
    expect(tracker.getActiveEnvKeys()).toHaveLength(0);
  });

  it("should clear all tracking", () => {
    const tracker = new SkillEnvTracker();
    tracker.track("skill1", "KEY1");
    tracker.track("skill2", "KEY2");

    tracker.clear();

    expect(tracker.getActiveEnvKeys()).toHaveLength(0);
  });
});

describe("Sandbox: Utilities", () => {
  it("getSandboxSkillsDir should return correct path", () => {
    const result = getSandboxSkillsDir("/tmp/sandbox");
    expect(result).toBe(path.join("/tmp/sandbox", "sandbox-skills"));
  });
});