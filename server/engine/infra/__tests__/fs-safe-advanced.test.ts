import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  assertNoHardlinkedFinalPath,
  assertNoSymlinkParents,
  assertNoSymlinkParentsSync,
  sameFileIdentity,
  writeViaSiblingTempPath,
  sanitizeUntrustedFileName,
  formatPosixMode,
} from "../fs-safe-advanced.js";

describe("fs-safe-advanced", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-safe-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("assertNoHardlinkedFinalPath", () => {
    it("应该允许普通文件", async () => {
      const filePath = path.join(tempDir, "regular.txt");
      await fs.writeFile(filePath, "hello");
      expect(() => assertNoHardlinkedFinalPath(filePath)).not.toThrow();
    });

    it("应该允许目录", async () => {
      const dirPath = path.join(tempDir, "subdir");
      await fs.mkdir(dirPath);
      expect(() => assertNoHardlinkedFinalPath(dirPath)).not.toThrow();
    });

    it("应该拒绝硬链接文件", async () => {
      const fileA = path.join(tempDir, "a.txt");
      const fileB = path.join(tempDir, "b.txt");
      await fs.writeFile(fileA, "hello");
      await fs.link(fileA, fileB);
      expect(() => assertNoHardlinkedFinalPath(fileB)).toThrow("Hardlinked file is not allowed");
    });
  });

  describe("assertNoSymlinkParents", () => {
    it("应该允许无符号链接的路径", async () => {
      const filePath = path.join(tempDir, "a", "b", "c.txt");
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "hello");
      await expect(assertNoSymlinkParents(filePath)).resolves.not.toThrow();
    });

    it("应该拒绝符号链接父目录", async () => {
      const realDir = path.join(tempDir, "real");
      const linkDir = path.join(tempDir, "link");
      await fs.mkdir(realDir);
      await fs.symlink(realDir, linkDir);
      const filePath = path.join(linkDir, "file.txt");
      await expect(assertNoSymlinkParents(filePath)).rejects.toThrow("Symlink parent is not allowed");
    });

    it("allowSymlinkInRoot 应该允许根目录是符号链接", async () => {
      const realDir = path.join(tempDir, "real");
      const linkDir = path.join(tempDir, "link");
      await fs.mkdir(realDir);
      await fs.symlink(realDir, linkDir);
      const filePath = path.join(linkDir, "file.txt");
      await expect(
        assertNoSymlinkParents(filePath, { rootDir: linkDir, allowSymlinkInRoot: true }),
      ).resolves.not.toThrow();
    });
  });

  describe("assertNoSymlinkParentsSync", () => {
    it("应该允许无符号链接的路径", () => {
      const filePath = path.join(tempDir, "a", "b", "c.txt");
      fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
      fsSync.writeFileSync(filePath, "hello");
      expect(() => assertNoSymlinkParentsSync(filePath)).not.toThrow();
    });

    it("应该拒绝符号链接父目录", () => {
      const realDir = path.join(tempDir, "real");
      const linkDir = path.join(tempDir, "link");
      fsSync.mkdirSync(realDir);
      fsSync.symlinkSync(realDir, linkDir);
      const filePath = path.join(linkDir, "file.txt");
      expect(() => assertNoSymlinkParentsSync(filePath)).toThrow("Symlink parent is not allowed");
    });
  });

  describe("sameFileIdentity", () => {
    it("应该识别同一文件为相同", async () => {
      const filePath = path.join(tempDir, "a.txt");
      await fs.writeFile(filePath, "hello");
      const result = await sameFileIdentity(filePath, filePath);
      expect(result).toBe(true);
    });

    it("应该识别不同文件为不同", async () => {
      const fileA = path.join(tempDir, "a.txt");
      const fileB = path.join(tempDir, "b.txt");
      await fs.writeFile(fileA, "hello");
      await fs.writeFile(fileB, "world");
      const result = await sameFileIdentity(fileA, fileB);
      expect(result).toBe(false);
    });

    it("应该识别硬链接为相同", async () => {
      const fileA = path.join(tempDir, "a.txt");
      const fileB = path.join(tempDir, "b.txt");
      await fs.writeFile(fileA, "hello");
      await fs.link(fileA, fileB);
      const result = await sameFileIdentity(fileA, fileB);
      expect(result).toBe(true);
    });

    it("不存在的文件应该返回 false", async () => {
      const filePath = path.join(tempDir, "a.txt");
      const result = await sameFileIdentity(filePath, filePath);
      expect(result).toBe(false);
    });
  });

  describe("writeViaSiblingTempPath", () => {
    it("应该原子写入文件", async () => {
      const filePath = path.join(tempDir, "target.txt");
      await writeViaSiblingTempPath({ filePath, content: "hello world" });
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe("hello world");
    });

    it("应该支持 Buffer 内容", async () => {
      const filePath = path.join(tempDir, "target.bin");
      await writeViaSiblingTempPath({ filePath, content: Buffer.from([0x00, 0x01, 0x02]) });
      const content = await fs.readFile(filePath);
      expect(content).toEqual(Buffer.from([0x00, 0x01, 0x02]));
    });

    it("应该创建父目录", async () => {
      const filePath = path.join(tempDir, "a", "b", "c.txt");
      await writeViaSiblingTempPath({ filePath, content: "nested" });
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe("nested");
    });

    it("应该返回文件路径", async () => {
      const filePath = path.join(tempDir, "target.txt");
      const result = await writeViaSiblingTempPath({ filePath, content: "hello" });
      expect(result).toBe(filePath);
    });
  });

  describe("sanitizeUntrustedFileName", () => {
    it("应该保留合法字符", () => {
      expect(sanitizeUntrustedFileName("hello.txt")).toBe("hello.txt");
      expect(sanitizeUntrustedFileName("file-name_123")).toBe("file-name_123");
    });

    it("应该替换非法字符", () => {
      expect(sanitizeUntrustedFileName("hello/world.txt")).toBe("hello_world.txt");
      expect(sanitizeUntrustedFileName("file:name")).toBe("file_name");
      expect(sanitizeUntrustedFileName("test..file")).toBe("test..file");
    });

    it("应该截断超过 255 字符的文件名", () => {
      const longName = "a".repeat(300);
      expect(sanitizeUntrustedFileName(longName).length).toBe(255);
    });
  });

  describe("formatPosixMode", () => {
    it("应该格式化文件模式", () => {
      expect(formatPosixMode(0o644)).toBe("644");
      expect(formatPosixMode(0o755)).toBe("755");
      expect(formatPosixMode(0o777)).toBe("777");
    });

    it("应该过滤掉非权限位", () => {
      expect(formatPosixMode(0o100644)).toBe("644");
      expect(formatPosixMode(0o40755)).toBe("755");
    });
  });
});
