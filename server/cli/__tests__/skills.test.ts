/**
 * CLI skills 命令测试
 *
 * 覆盖 registerSkillsCommand 的契约行为：
 * - 子命令注册（list/install/scan/enable/disable/info）
 * - 技能列表、安装、扫描、启用/禁用、详情
 * - JSON 与文本输出
 *
 * 通过注入 SkillCommandProvider 伪实现，使测试与真实注册表解耦，
 * 保持确定性、快速、无文件系统依赖。真实数据来源由 RealSkillProvider 负责。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Command } from "commander";
import {
  registerSkillsCommand,
  type SkillCommandProvider,
  type SkillEntry,
} from "../commands/skills.js";

// 捕获 process.stdout.write 输出
let outputs: string[];
let stdoutWrite: typeof process.stdout.write;

beforeEach(() => {
  outputs = [];
  stdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string) => {
    outputs.push(chunk);
    return true;
  };
});

// 伪 Provider：返回确定性数据，模拟真实注册表契约
function makeFakeProvider(): SkillCommandProvider {
  const entries: SkillEntry[] = [
    {
      id: "web-search",
      name: "网页搜索",
      description: "联网搜索与内容抓取",
      version: "2.1.3",
      enabled: true,
      source: "builtin",
      installedAt: "2025-01-10T08:00:00Z",
    },
    {
      id: "pdf-tools",
      name: "PDF 工具",
      description: "PDF 文档读取与处理",
      version: "1.0.0",
      enabled: true,
      source: "builtin",
      installedAt: "2025-01-10T08:00:00Z",
    },
    {
      id: "wms-ops",
      name: "WMS 运营",
      description: "仓储管理操作技能",
      version: "0.4.2",
      enabled: false,
      source: "local",
      installedAt: "2025-01-20T12:00:00Z",
    },
  ];
  const byId = (id: string) => entries.find((e) => e.id === id);

  return {
    list: async () => entries,
    info: async (id: string) => byId(id),
    scan: async () => ({ found: 3, eligible: ["code-review", "git-flow", "data-analysis"] }),
    install: async (spec: string) => {
      const id = spec.split("@")[0];
      const version = spec.split("@")[1] || "1.0.0";
      return {
        id,
        name: id,
        description: `已安装技能 ${id}`,
        version,
        enabled: true,
        source: "local",
        installedAt: new Date().toISOString(),
      };
    },
    enable: async (id: string) => !!byId(id),
    disable: async (id: string) => !!byId(id),
  };
}

describe("CLI skills 命令 Contract", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    registerSkillsCommand(program, makeFakeProvider());
  });

  it("注册名为 skill 的命令", () => {
    const cmd = program.commands.find((c) => c.name() === "skill");
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain("技能");
  });

  it("包含子命令 list/install/scan/enable/disable/info", () => {
    const skillsCmd = program.commands.find((c) => c.name() === "skill")!;
    const subNames = skillsCmd.commands.map((c) => c.name());
    expect(subNames).toContain("list");
    expect(subNames).toContain("install");
    expect(subNames).toContain("scan");
    expect(subNames).toContain("enable");
    expect(subNames).toContain("disable");
    expect(subNames).toContain("info");
  });

  describe("list 子命令", () => {
    it("输出包含所有技能", async () => {
      await program.parseAsync(["node", "test", "skill", "list", "--json"]);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed).toBeInstanceOf(Array);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it("每个技能有 id/name/version/enabled/source 字段", async () => {
      await program.parseAsync(["node", "test", "skill", "list", "--json"]);
      const parsed = JSON.parse(outputs[0]);
      for (const skill of parsed) {
        expect(skill.id).toBeDefined();
        expect(skill.name).toBeDefined();
        expect(skill.version).toBeDefined();
        expect(typeof skill.enabled).toBe("boolean");
        expect(["builtin", "local", "remote"]).toContain(skill.source);
      }
    });
  });

  describe("install 子命令", () => {
    it("安装技能返回完整技能对象", async () => {
      await program.parseAsync(["node", "test", "skill", "install", "my-skill@1.0.0", "--json"]);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.id).toBe("my-skill");
      expect(parsed.version).toBe("1.0.0");
      expect(parsed.enabled).toBe(true);
    });

    it("重复安装更新版本", async () => {
      await program.parseAsync(["node", "test", "skill", "install", "pdf-tools@2.0.0", "--json"]);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.version).toBe("2.0.0");
    });
  });

  describe("scan 子命令", () => {
    it("返回 found 和 eligible 数组", async () => {
      await program.parseAsync(["node", "test", "skill", "scan", "--json"]);
      const parsed = JSON.parse(outputs[0]);
      expect(typeof parsed.found).toBe("number");
      expect(parsed.eligible).toBeInstanceOf(Array);
    });
  });

  describe("enable/disable 子命令", () => {
    it("启用存在的技能返回 enabled=true", async () => {
      await program.parseAsync(["node", "test", "skill", "enable", "wms-ops", "--json"]);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.enabled).toBe(true);
    });

    it("禁用存在的技能返回 disabled=true", async () => {
      await program.parseAsync(["node", "test", "skill", "disable", "wms-ops", "--json"]);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.disabled).toBe(true);
    });

    it("启用不存在的技能返回 enabled=false", async () => {
      await program.parseAsync(["node", "test", "skill", "enable", "nonexistent", "--json"]);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.enabled).toBe(false);
    });
  });

  describe("info 子命令", () => {
    it("返回技能详情", async () => {
      await program.parseAsync(["node", "test", "skill", "info", "web-search", "--json"]);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.id).toBe("web-search");
      expect(parsed.name).toBeDefined();
    });

    it("不存在的技能返回 error", async () => {
      await program.parseAsync(["node", "test", "skill", "info", "nonexistent", "--json"]);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.error).toBe("not found");
    });
  });

  describe("默认行为（无子命令）", () => {
    it("默认调用 list", async () => {
      await program.parseAsync(["node", "test", "skill"]);
      const allOutput = outputs.join("\n");
      expect(allOutput).toContain("技能列表");
    });
  });
});
