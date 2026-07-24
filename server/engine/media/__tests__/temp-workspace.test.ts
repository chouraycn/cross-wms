/**
 * temp-workspace 单元测试
 */

import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import {
  tempWorkspace,
  tempWorkspaceSync,
  withTempWorkspace,
} from "../temp-workspace.js";

const ROOT = path.join(os.tmpdir(), "cross-wms-temp-workspace-tests");

afterEach(() => {
  try {
    fs.rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

describe("media / temp-workspace", () => {
  it("tempWorkspace 应在根目录下创建真实目录", () => {
    const ws = tempWorkspace({ rootDir: ROOT, prefix: "ws-" });
    expect(fs.existsSync(ws.dir)).toBe(true);
    expect(ws.dir.startsWith(ROOT)).toBe(true);
  });

  it("tempWorkspace write/read 应能往返数据", async () => {
    const ws = tempWorkspace({ rootDir: ROOT, prefix: "rw-" });
    const data = Buffer.from([1, 2, 3, 4, 5]);
    await ws.write("file.bin", data);
    const read = await ws.read("file.bin");
    expect(read).toEqual(data);
  });

  it("tempWorkspace write 应返回绝对路径", async () => {
    const ws = tempWorkspace({ rootDir: ROOT, prefix: "abs-" });
    const target = await ws.write("a.txt", "hello");
    expect(path.isAbsolute(target)).toBe(true);
    expect(fs.existsSync(target)).toBe(true);
  });

  it("tempWorkspace write 应将文件名收敛为 basename（防止路径逃逸）", async () => {
    const ws = tempWorkspace({ rootDir: ROOT, prefix: "seg-" });
    const target = await ws.write("sub/dir/file.txt", "data");
    expect(path.basename(target)).toBe("file.txt");
    expect(fs.existsSync(path.join(ws.dir, "sub"))).toBe(false);
  });

  it("tempWorkspace write 对空/点段应抛出 RangeError", async () => {
    const ws = tempWorkspace({ rootDir: ROOT, prefix: "err-" });
    await expect(ws.write("", "x")).rejects.toThrow(RangeError);
    await expect(ws.write(".", "x")).rejects.toThrow(RangeError);
    await expect(ws.write("..", "x")).rejects.toThrow(RangeError);
  });

  it("tempWorkspace cleanup 应删除目录", async () => {
    const ws = tempWorkspace({ rootDir: ROOT, prefix: "clean-" });
    await ws.write("a.txt", "x");
    expect(fs.existsSync(ws.dir)).toBe(true);
    await ws.cleanup();
    expect(fs.existsSync(ws.dir)).toBe(false);
  });

  it("tempWorkspaceSync write/read/path 应同步工作", () => {
    const ws = tempWorkspaceSync({ rootDir: ROOT, prefix: "sync-" });
    const data = Buffer.from([9, 8, 7]);
    const target = ws.write("sync.bin", data);
    expect(ws.path("sync.bin")).toBe(target);
    expect(ws.read("sync.bin")).toEqual(data);
  });

  it("tempWorkspaceSync write 对点段应抛出 RangeError", () => {
    const ws = tempWorkspaceSync({ rootDir: ROOT, prefix: "sync-err-" });
    expect(() => ws.write("..", "x")).toThrow(RangeError);
  });

  it("withTempWorkspace 应返回 fn 结果并在完成后清理", async () => {
    const result = await withTempWorkspace(
      { rootDir: ROOT, prefix: "with-" },
      async (ws) => {
        await ws.write("in.txt", "payload");
        return ws.dir;
      },
    );
    expect(typeof result).toBe("string");
    expect(fs.existsSync(result)).toBe(false);
  });

  it("withTempWorkspace 在 fn 抛错时应传播错误并清理", async () => {
    let captured = "";
    await expect(
      withTempWorkspace(
        { rootDir: ROOT, prefix: "throw-" },
        async (ws) => {
          captured = ws.dir;
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");
    expect(fs.existsSync(captured)).toBe(false);
  });

  it("prefix 中的特殊字符应被替换为连字符", () => {
    const ws = tempWorkspace({ rootDir: ROOT, prefix: "a b/c!d" });
    const base = path.basename(ws.dir);
    expect(base.startsWith("a-b-c-d")).toBe(true);
  });
});
