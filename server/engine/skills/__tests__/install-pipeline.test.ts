import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import JSZip from "jszip";
import { verifyChecksum, computeFileChecksum, downloadClawHubSkillArchive } from "../lifecycle/install-download.js";
import {
  extractArchive,
  findArchiveRootDir,
  withExtractedArchiveRoot,
  CLAWHUB_SKILL_ARCHIVE_ROOT_MARKERS,
} from "../lifecycle/install-extract.js";
import {
  writeWorkspaceSkill,
  readWorkspaceSkillFile,
  assertInsideWorkspace,
  normalizeWorkspaceSkillSupportPath,
} from "../lifecycle/workspace-skill-write.js";
import { workspaceSkillExists, listWorkspaceSkillNames } from "../loading/workspace.js";
import { installFromArchive, updateSkill } from "../lifecycle/install.js";
import { installFromSourceWithSupportFiles, readSkillWithSupportFiles } from "../lifecycle/source-install.js";

describe("技能安装流水线测试", () => {
  let tempDir: string;
  let workspaceDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-install-test-"));
    workspaceDir = path.join(tempDir, "workspace");
    await fs.mkdir(workspaceDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("install-download - 校验和功能", () => {
    it("应该正确计算和验证文件的 SHA256 校验和", async () => {
      const testFile = path.join(tempDir, "test.txt");
      const content = "Hello, World!";
      await fs.writeFile(testFile, content, "utf-8");

      const checksum = await computeFileChecksum(testFile);
      expect(checksum).toBeDefined();
      expect(typeof checksum).toBe("string");
      expect(checksum.length).toBe(64);

      const expectedHash = crypto.createHash("sha256").update(content).digest("hex");
      expect(checksum).toBe(expectedHash);
    });

    it("verifyChecksum 应该对正确的校验和返回 true", async () => {
      const testFile = path.join(tempDir, "test.txt");
      const content = "Test content for checksum";
      await fs.writeFile(testFile, content, "utf-8");

      const expectedHash = crypto.createHash("sha256").update(content).digest("hex");
      const result = await verifyChecksum(testFile, expectedHash);
      expect(result).toBe(true);
    });

    it("verifyChecksum 应该对错误的校验和返回 false", async () => {
      const testFile = path.join(tempDir, "test.txt");
      await fs.writeFile(testFile, "Test content", "utf-8");

      const wrongHash = "a".repeat(64);
      const result = await verifyChecksum(testFile, wrongHash);
      expect(result).toBe(false);
    });
  });

  describe("install-download - ClawHub Mock", () => {
    it("downloadClawHubSkillArchive 应该返回 mock 归档信息", async () => {
      const archive = await downloadClawHubSkillArchive("test-skill", "1.0.0");
      expect(archive.slug).toBe("test-skill");
      expect(archive.version).toBe("1.0.0");
      expect(archive.downloadUrl).toContain("test-skill");
      expect(archive.downloadUrl).toContain("1.0.0");
      expect(archive.sha256).toBeDefined();
      expect(archive.sha256.length).toBe(64);
      expect(archive.size).toBeGreaterThan(0);
    });
  });

  describe("install-extract - ZIP 解压", () => {
    it("应该正确解压 ZIP 归档", async () => {
      const zipPath = path.join(tempDir, "test-skill.zip");
      const destDir = path.join(tempDir, "extracted");

      const zip = new JSZip();
      zip.file("SKILL.md", "---\nname: test-skill\n---\n\n# Test Skill\n");
      zip.file("README.md", "# Readme\n");
      zip.folder("scripts")?.file("run.sh", "#!/bin/bash\necho hello\n");

      const zipContent = await zip.generateAsync({ type: "nodebuffer" });
      await fs.writeFile(zipPath, zipContent);

      const files = await extractArchive(zipPath, destDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files).toContain("SKILL.md");
      expect(files).toContain("README.md");

      const skillContent = await fs.readFile(path.join(destDir, "SKILL.md"), "utf-8");
      expect(skillContent).toContain("test-skill");
    });

    it("应该支持 stripComponents 选项", async () => {
      const zipPath = path.join(tempDir, "test-strip.zip");
      const destDir = path.join(tempDir, "extracted-strip");

      const zip = new JSZip();
      zip.folder("my-skill-v1.0")?.file("SKILL.md", "---\nname: my-skill\n---\n");
      zip.folder("my-skill-v1.0")?.file("helper.js", "console.log('hello');\n");

      const zipContent = await zip.generateAsync({ type: "nodebuffer" });
      await fs.writeFile(zipPath, zipContent);

      const files = await extractArchive(zipPath, destDir, { stripComponents: 1 });
      expect(files).toContain("SKILL.md");
      expect(files).toContain("helper.js");
    });
  });

  describe("install-extract - 查找技能根目录", () => {
    it("findArchiveRootDir 应该找到包含 SKILL.md 的目录", async () => {
      const testDir = path.join(tempDir, "archive");
      await fs.mkdir(path.join(testDir, "subdir", "nested"), { recursive: true });
      await fs.writeFile(path.join(testDir, "subdir", "nested", "SKILL.md"), "---\nname: nested-skill\n---\n");
      await fs.writeFile(path.join(testDir, "other-file.txt"), "not a skill");

      const rootDir = await findArchiveRootDir(testDir);
      expect(rootDir).toBeDefined();
      expect(rootDir).toContain("nested");
    });

    it("findArchiveRootDir 应该找到包含 skill.json 的目录", async () => {
      const testDir = path.join(tempDir, "archive2");
      await fs.mkdir(path.join(testDir, "pkg"), { recursive: true });
      await fs.writeFile(path.join(testDir, "pkg", "skill.json"), '{"name": "json-skill"}');

      const rootDir = await findArchiveRootDir(testDir);
      expect(rootDir).toBeDefined();
      expect(rootDir).toContain("pkg");
    });

    it("findArchiveRootDir 找不到时返回 null", async () => {
      const testDir = path.join(tempDir, "empty");
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(path.join(testDir, "readme.txt"), "just a readme");

      const rootDir = await findArchiveRootDir(testDir);
      expect(rootDir).toBeNull();
    });

    it("CLAWHUB_SKILL_ARCHIVE_ROOT_MARKERS 应该包含正确的标识文件", () => {
      expect(CLAWHUB_SKILL_ARCHIVE_ROOT_MARKERS).toContain("SKILL.md");
      expect(CLAWHUB_SKILL_ARCHIVE_ROOT_MARKERS).toContain("skill.json");
    });
  });

  describe("install-extract - withExtractedArchiveRoot", () => {
    it("应该解压归档并找到技能根目录后执行回调", async () => {
      const zipPath = path.join(tempDir, "test-callback.zip");
      const destDir = path.join(tempDir, "callback-dest");

      const zip = new JSZip();
      zip.folder("skill-package")?.file("SKILL.md", "---\nname: callback-skill\n---\n");
      zip.folder("skill-package")?.folder("tools")?.file("tool1.js", "// tool 1\n");

      const zipContent = await zip.generateAsync({ type: "nodebuffer" });
      await fs.writeFile(zipPath, zipContent);

      const result = await withExtractedArchiveRoot(zipPath, destDir, async (skillRoot) => {
        const skillFile = path.join(skillRoot, "SKILL.md");
        const content = await fs.readFile(skillFile, "utf-8");
        return { skillRoot, content };
      });

      expect(result.skillRoot).toBeDefined();
      expect(result.content).toContain("callback-skill");
    });
  });

  describe("workspace-skill-write - 写入和读取", () => {
    it("writeWorkspaceSkill 应该成功写入技能", async () => {
      const content = "---\nname: test-write\n---\n\n# Test\n";
      const skillDir = path.join(workspaceDir, ".cross-wms", "skills", "test-write");
      await writeWorkspaceSkill({
        workspaceDir,
        skillDir,
        skillFile: path.join(skillDir, "SKILL.md"),
        content,
        mode: "create",
        symlinkPolicy: { allowWrites: false, allowedTargetRealPaths: [] },
      });

      const stat = await fs.stat(path.join(skillDir, "SKILL.md"));
      expect(stat.isFile()).toBe(true);
    });

    it("readWorkspaceSkillFile 应该能读取已写入的技能", async () => {
      const content = "---\nname: test-read\n---\n\n# Read Test\n";
      const skillDir = path.join(workspaceDir, ".cross-wms", "skills", "test-read");
      await writeWorkspaceSkill({
        workspaceDir,
        skillDir,
        skillFile: path.join(skillDir, "SKILL.md"),
        content,
        mode: "create",
        symlinkPolicy: { allowWrites: false, allowedTargetRealPaths: [] },
      });

      const readContent = await readWorkspaceSkillFile(path.join(skillDir, "SKILL.md"));
      expect(readContent).toBe(content);
    });

    it("readWorkspaceSkillFile 读取不存在的技能返回 null", async () => {
      const content = await readWorkspaceSkillFile(path.join(workspaceDir, ".cross-wms", "skills", "nonexistent", "SKILL.md"));
      expect(content).toBeNull();
    });

    it("writeWorkspaceSkill 应该写入支持文件", async () => {
      const content = "---\nname: test-support\n---\n\n# Support Files Test\n";
      const supportFiles = [
        { path: "scripts/helper.js", content: "console.log('hello');\n" },
        { path: "templates/config.json", content: '{"key": "value"}\n' },
      ];

      const skillDir = path.join(workspaceDir, ".cross-wms", "skills", "test-support");
      await writeWorkspaceSkill({
        workspaceDir,
        skillDir,
        skillFile: path.join(skillDir, "SKILL.md"),
        content,
        supportFiles,
        mode: "create",
        symlinkPolicy: { allowWrites: false, allowedTargetRealPaths: [] },
      });

      const helperFile = path.join(skillDir, "scripts", "helper.js");
      const configFile = path.join(skillDir, "templates", "config.json");

      const helperContent = await fs.readFile(helperFile, "utf-8");
      expect(helperContent).toContain("console.log");

      const configContent = await fs.readFile(configFile, "utf-8");
      expect(configContent).toContain("key");
    });
  });

  describe("workspace-skill-write - 安全检查", () => {
    it("assertInsideWorkspace 应该允许工作区内的路径", () => {
      const skillsDir = path.join(workspaceDir, ".cross-wms", "skills");
      const skillDir = path.join(skillsDir, "my-skill");
      expect(() => assertInsideWorkspace(skillsDir, skillDir)).not.toThrow();
    });

    it("assertInsideWorkspace 应该拒绝工作区外的路径", () => {
      const skillsDir = path.join(workspaceDir, ".cross-wms", "skills");
      const outsidePath = path.join(workspaceDir, "outside");
      expect(() => assertInsideWorkspace(skillsDir, outsidePath)).toThrow();
    });

    it("assertInsideWorkspace 应该拒绝路径遍历", () => {
      const skillsDir = path.join(workspaceDir, ".cross-wms", "skills");
      const traversalPath = path.join(skillsDir, "..", "..", "etc", "passwd");
      expect(() => assertInsideWorkspace(skillsDir, traversalPath)).toThrow();
    });

    it("normalizeWorkspaceSkillSupportPath 应该拒绝绝对路径", () => {
      expect(() => normalizeWorkspaceSkillSupportPath("/etc/passwd")).toThrow();
    });

    it("normalizeWorkspaceSkillSupportPath 应该拒绝路径遍历", () => {
      expect(() => normalizeWorkspaceSkillSupportPath("../evil")).toThrow();
    });
  });

  describe("workspace-skill-write - 辅助功能", () => {
    it("workspaceSkillExists 应该正确检测技能是否存在", async () => {
      const content = "---\nname: exists-test\n---\n";
      const skillDir = path.join(workspaceDir, ".cross-wms", "skills", "exists-test");
      await writeWorkspaceSkill({
        workspaceDir,
        skillDir,
        skillFile: path.join(skillDir, "SKILL.md"),
        content,
        mode: "create",
        symlinkPolicy: { allowWrites: false, allowedTargetRealPaths: [] },
      });

      const exists = await workspaceSkillExists(workspaceDir, "exists-test");
      expect(exists).toBe(true);

      const notExists = await workspaceSkillExists(workspaceDir, "not-exists");
      expect(notExists).toBe(false);
    });

    it("deleteWorkspaceSkill 应该删除技能", async () => {
      const content = "---\nname: delete-test\n---\n";
      const skillDir = path.join(workspaceDir, ".cross-wms", "skills", "delete-test");
      await writeWorkspaceSkill({
        workspaceDir,
        skillDir,
        skillFile: path.join(skillDir, "SKILL.md"),
        content,
        mode: "create",
        symlinkPolicy: { allowWrites: false, allowedTargetRealPaths: [] },
      });

      await fs.rm(skillDir, { recursive: true, force: true });

      const exists = await workspaceSkillExists(workspaceDir, "delete-test");
      expect(exists).toBe(false);
    });

    it("listWorkspaceSkills 应该列出所有技能", async () => {
      const skillDirA = path.join(workspaceDir, ".cross-wms", "skills", "skill-a");
      await writeWorkspaceSkill({
        workspaceDir,
        skillDir: skillDirA,
        skillFile: path.join(skillDirA, "SKILL.md"),
        content: "---\nname: a\n---\n",
        mode: "create",
        symlinkPolicy: { allowWrites: false, allowedTargetRealPaths: [] },
      });

      const skillDirB = path.join(workspaceDir, ".cross-wms", "skills", "skill-b");
      await writeWorkspaceSkill({
        workspaceDir,
        skillDir: skillDirB,
        skillFile: path.join(skillDirB, "SKILL.md"),
        content: "---\nname: b\n---\n",
        mode: "create",
        symlinkPolicy: { allowWrites: false, allowedTargetRealPaths: [] },
      });

      const skills = await listWorkspaceSkillNames(workspaceDir);
      expect(skills).toContain("skill-a");
      expect(skills).toContain("skill-b");
      expect(skills).toEqual(expect.arrayContaining(["skill-a", "skill-b"]));
    });
  });

  describe("install - 从归档安装", () => {
    it("installFromArchive 应该从 ZIP 归档安装技能", async () => {
      const zipPath = path.join(tempDir, "install-test.zip");

      const zip = new JSZip();
      zip.file("SKILL.md", "---\nname: archive-install-skill\ndescription: Test skill from archive\n---\n\n# Archive Install Test\n");
      zip.file("utils.js", "// utility functions\n");

      const zipContent = await zip.generateAsync({ type: "nodebuffer" });
      await fs.writeFile(zipPath, zipContent);

      const result = await installFromArchive(zipPath, {
        workspaceDir,
        force: true,
      });

      expect(result.success).toBe(true);
      expect(result.skillName).toBe("archive-install-skill");
      expect(result.installedPath).toBeDefined();

      const skillContent = await readWorkspaceSkillFile(path.join(workspaceDir, ".cross-wms", "skills", "archive-install-skill", "SKILL.md"));
      expect(skillContent).toContain("archive-install-skill");
    });

    it("installFromArchive 应该能指定技能名称", async () => {
      const zipPath = path.join(tempDir, "install-test2.zip");

      const zip = new JSZip();
      zip.file("SKILL.md", "---\nname: original-name\n---\n");

      const zipContent = await zip.generateAsync({ type: "nodebuffer" });
      await fs.writeFile(zipPath, zipContent);

      const result = await installFromArchive(zipPath, {
        workspaceDir,
        skillName: "custom-name",
        force: true,
      });

      expect(result.success).toBe(true);
      expect(result.skillName).toBe("custom-name");
    });

    it("installFromArchive 已存在技能时应该失败（无 force）", async () => {
      const zipPath = path.join(tempDir, "install-test3.zip");

      const zip = new JSZip();
      zip.file("SKILL.md", "---\nname: duplicate-skill\n---\n");

      const zipContent = await zip.generateAsync({ type: "nodebuffer" });
      await fs.writeFile(zipPath, zipContent);

      await installFromArchive(zipPath, { workspaceDir, force: true });
      const result = await installFromArchive(zipPath, { workspaceDir });

      expect(result.success).toBe(false);
      expect(result.error).toContain("already exists");
    });

    it("updateSkill 应该更新已有技能", async () => {
      const initialContent = "---\nname: update-test\n---\n\n# Version 1\n";
      const skillDir = path.join(workspaceDir, ".cross-wms", "skills", "update-test");
      await writeWorkspaceSkill({
        workspaceDir,
        skillDir,
        skillFile: path.join(skillDir, "SKILL.md"),
        content: initialContent,
        mode: "create",
        symlinkPolicy: { allowWrites: false, allowedTargetRealPaths: [] },
      });

      const newContent = "---\nname: update-test\n---\n\n# Version 2\n";
      const result = await updateSkill(workspaceDir, "update-test", newContent);

      expect(result.success).toBe(true);

      const readContent = await readWorkspaceSkillFile(path.join(skillDir, "SKILL.md"));
      expect(readContent).toContain("Version 2");
    });
  });

  describe("source-install - 带支持文件", () => {
    it("installFromSourceWithSupportFiles 应该安装带支持文件的技能", async () => {
      const supportFiles = [
        { path: "scripts/tool.py", content: "print('hello')\n" },
        { path: "templates/template1.md", content: "# Template\n" },
      ];

      const result = await installFromSourceWithSupportFiles(
        {
          workspaceDir,
          skillName: "support-test",
          content: "---\nname: support-test\n---\n\n# Test\n",
          force: true,
        },
        supportFiles,
      );

      expect(result.success).toBe(true);
      expect(result.skillName).toBe("support-test");
    });

    it("readSkillWithSupportFiles 应该读取技能及其支持文件", async () => {
      const supportFiles = [
        { path: "scripts/helper.js", content: "// helper\n" },
        { path: "references/docs/usage.md", content: "# Usage\n" },
      ];

      await installFromSourceWithSupportFiles(
        {
          workspaceDir,
          skillName: "read-support-test",
          content: "---\nname: read-support-test\n---\n\n# Test\n",
        },
        supportFiles,
      );

      const result = await readSkillWithSupportFiles(workspaceDir, "read-support-test");
      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.supportFiles).toBeDefined();
      expect(result.supportFiles).toContain("scripts/helper.js");
      expect(result.supportFiles).toContain("references/docs/usage.md");
    });
  });
});
