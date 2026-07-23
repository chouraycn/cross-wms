import { describe, it, expect } from "vitest";
import {
  DEFAULT_AGENT_ID,
  assertNoSymlinkParentsSync,
} from "../_openclaw-infra-deps.js";
import type { CommandExplanationSummary } from "../_openclaw-infra-deps.js";

describe("DEFAULT_AGENT_ID", () => {
  it("应使用规范值 'main'（修正原 stub 错误值 'default'）", () => {
    expect(DEFAULT_AGENT_ID).toBe("main");
  });
});

describe("CommandExplanationSummary", () => {
  it("应允许构造符合类型的对象", () => {
    const summary: CommandExplanationSummary = {
      commandCount: 1,
      nestedCommandCount: 0,
      riskKinds: [],
      warningLines: [],
    };
    expect(summary.commandCount).toBe(1);
  });
});

describe("assertNoSymlinkParentsSync", () => {
  it("应无错误地执行用于根目录内的目标路径", () => {
    expect(() =>
      assertNoSymlinkParentsSync({ rootDir: "/tmp", targetPath: "/tmp/test" }),
    ).not.toThrow();
  });

  it("应拒绝根目录之外的目标路径（未启用 allowOutsideRoot）", () => {
    expect(() =>
      assertNoSymlinkParentsSync({ rootDir: "/tmp", targetPath: "/var/log" }),
    ).toThrow(/在根目录/);
  });

  it("启用 allowOutsideRoot 时跳过根目录范围检查（仍检查路径上的符号链接）", () => {
    // macOS 上 /var 是符号链接 → /private/var，因此会抛出符号链接错误
    expect(() =>
      assertNoSymlinkParentsSync({
        rootDir: "/tmp",
        targetPath: "/var/log",
        allowOutsideRoot: true,
      }),
    ).toThrow(/符号链接/);
  });
});
