import { describe, it, expect, beforeEach } from "vitest";
import {
  doctorCommands,
  registerDoctorCommands,
  registerDoctorCheck,
  type DoctorReport,
} from "../doctor/doctorCommand.js";
import {
  getCommandRegistry,
  resetCommandRegistryForTests,
  type CommandExecutionContext,
} from "../commandRegistry.js";

function ctx(overrides: Partial<CommandExecutionContext> = {}): CommandExecutionContext {
  return {
    sessionKey: "chat:test",
    userId: "u-1",
    message: "",
    args: {},
    rawArgs: "",
    timestamp: 1700000000000,
    ...overrides,
  };
}

function findEntry(name: string) {
  const entry = doctorCommands.find((c) => c.definition.name === name);
  if (!entry) throw new Error(`doctor command ${name} not found`);
  return entry;
}

describe("doctorCommand", () => {
  describe("导出结构", () => {
    it("doctorCommands 含 2 个命令", () => {
      expect(doctorCommands).toHaveLength(2);
      const names = doctorCommands.map((c) => c.definition.name);
      expect(names).toEqual(expect.arrayContaining(["doctor", "doctor-repair"]));
    });

    it("doctor 命令带 aliases diag/check", () => {
      expect(findEntry("doctor").definition.aliases).toEqual(["diag", "check"]);
    });

    it("所有命令 category=doctor", () => {
      for (const c of doctorCommands) {
        expect(c.definition.category).toBe("doctor");
      }
    });

    it("doctor-repair 是 hidden 命令", () => {
      expect(findEntry("doctor-repair").definition.hidden).toBe(true);
    });

    it("doctor scope 包含 chat 与 admin", () => {
      const scopes = findEntry("doctor").definition.scope;
      const arr = Array.isArray(scopes) ? scopes : [scopes];
      expect(arr).toContain("chat");
      expect(arr).toContain("admin");
    });

    it("doctor args scope 默认值为 all", () => {
      const arg = findEntry("doctor").definition.args?.[0];
      expect(arg?.name).toBe("scope");
      expect(arg?.defaultValue).toBe("all");
    });
  });

  describe("doctor handler", () => {
    it("scope=all 返回所有默认检查项", async () => {
      const { handler } = findEntry("doctor");
      const res = await handler(ctx({ args: { scope: "all" } }));
      expect(res.ok).toBe(true);
      const report = res.data as DoctorReport;
      expect(report.checks.length).toBeGreaterThanOrEqual(4);
      const names = report.checks.map((c) => c.name);
      expect(names).toEqual(expect.arrayContaining(["config", "database", "secrets", "sessions"]));
    });

    it("scope=config 仅返回 config 检查项", async () => {
      const { handler } = findEntry("doctor");
      const res = await handler(ctx({ args: { scope: "config" } }));
      expect(res.ok).toBe(true);
      const report = res.data as DoctorReport;
      expect(report.checks).toHaveLength(1);
      expect(report.checks[0].name).toBe("config");
    });

    it("未传 scope 时默认 all", async () => {
      const { handler } = findEntry("doctor");
      const res = await handler(ctx({ args: {} }));
      const report = res.data as DoctorReport;
      expect(report.checks.length).toBeGreaterThanOrEqual(4);
    });

    it("所有检查通过时 overall=ok 且 summary 含 '通过'", async () => {
      const { handler } = findEntry("doctor");
      const res = await handler(ctx({ args: { scope: "all" } }));
      const report = res.data as DoctorReport;
      expect(report.overall).toBe("ok");
      expect(report.summary).toContain("通过");
    });

    it("report 包含 startedAt 与 finishedAt 且 finishedAt >= startedAt", async () => {
      const { handler } = findEntry("doctor");
      const res = await handler(ctx());
      const report = res.data as DoctorReport;
      expect(typeof report.startedAt).toBe("number");
      expect(typeof report.finishedAt).toBe("number");
      expect(report.finishedAt).toBeGreaterThanOrEqual(report.startedAt);
    });

    it("session check 反映 ctx.sessionKey 是否存在", async () => {
      const { handler } = findEntry("doctor");
      const withKey = await handler(ctx({ sessionKey: "chat:1", args: { scope: "sessions" } }));
      const withReport = withKey.data as DoctorReport;
      expect(withReport.checks[0].message).toContain("1");

      const noKey = await handler(ctx({ sessionKey: "", args: { scope: "sessions" } }));
      const noReport = noKey.data as DoctorReport;
      expect(noReport.checks[0].message).toContain("0");
    });

    it("scope 不匹配任何检查项时返回空 checks 但 ok=true", async () => {
      const { handler } = findEntry("doctor");
      const res = await handler(ctx({ args: { scope: "nonexistent" } }));
      expect(res.ok).toBe(true);
      const report = res.data as DoctorReport;
      expect(report.checks).toEqual([]);
      expect(report.overall).toBe("ok");
    });
  });

  describe("doctor-repair handler", () => {
    it("未传 yes 时返回确认提示", async () => {
      const { handler } = findEntry("doctor-repair");
      const res = await handler(ctx({ args: { yes: false } }));
      expect(res.ok).toBe(true);
      expect(res.message).toContain("确认");
      const data = res.data as { autoApplied: boolean };
      expect(data.autoApplied).toBe(false);
    });

    it("yes=true 时自动应用修复", async () => {
      const { handler } = findEntry("doctor-repair");
      const res = await handler(ctx({ args: { yes: true } }));
      expect(res.ok).toBe(true);
      expect(res.message).toContain("自动");
      const data = res.data as { autoApplied: boolean; actions: string[] };
      expect(data.autoApplied).toBe(true);
      expect(data.actions.length).toBeGreaterThan(0);
    });

    it("未传 yes 默认为非自动模式", async () => {
      const { handler } = findEntry("doctor-repair");
      const res = await handler(ctx({ args: {} }));
      const data = res.data as { autoApplied: boolean };
      expect(data.autoApplied).toBe(false);
    });
  });

  describe("registerDoctorCheck", () => {
    it("注册的 check 名称出现在 doctor 报告中", async () => {
      const uniqueName = `custom-check-${Date.now()}`;
      registerDoctorCheck(uniqueName, async () => ({
        name: uniqueName,
        status: "ok",
        message: "custom ok",
      }));
      const { handler } = findEntry("doctor");
      const res = await handler(ctx({ args: { scope: uniqueName } }));
      const report = res.data as DoctorReport;
      expect(report.checks.some((c) => c.name === uniqueName)).toBe(true);
    });
  });

  describe("registerDoctorCommands", () => {
    beforeEach(() => {
      resetCommandRegistryForTests();
    });

    it("注册 doctor 与 doctor-repair 到 registry", () => {
      registerDoctorCommands();
      const reg = getCommandRegistry();
      expect(reg.size()).toBe(2);
      expect(reg.has("doctor")).toBe(true);
      expect(reg.has("doctor-repair")).toBe(true);
    });

    it("doctor 别名 diag/check 可解析", () => {
      registerDoctorCommands();
      const reg = getCommandRegistry();
      expect(reg.get("diag")?.name).toBe("doctor");
      expect(reg.get("check")?.name).toBe("doctor");
    });
  });
});
