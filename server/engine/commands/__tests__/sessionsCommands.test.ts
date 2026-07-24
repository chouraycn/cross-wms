import { describe, it, expect, beforeEach } from "vitest";
import {
  sessionsCommands,
  registerSessionsCommands,
  type SessionRow,
} from "../sessions/sessionsCommands.js";
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
  const entry = sessionsCommands.find((c) => c.definition.name === name);
  if (!entry) throw new Error(`sessions command ${name} not found`);
  return entry;
}

describe("sessionsCommands", () => {
  describe("导出结构", () => {
    it("sessionsCommands 含 4 个命令", () => {
      expect(sessionsCommands).toHaveLength(4);
      const names = sessionsCommands.map((c) => c.definition.name);
      expect(names).toEqual(
        expect.arrayContaining(["sessions", "sessions-cleanup", "sessions-compact", "sessions-tail"]),
      );
    });

    it("所有命令 category=session", () => {
      for (const c of sessionsCommands) {
        expect(c.definition.category).toBe("session");
      }
    });

    it("sessions 命令带别名 sessions-list", () => {
      expect(findEntry("sessions").definition.aliases).toEqual(["sessions-list"]);
    });

    it("sessions-compact 命令带别名 compact-session", () => {
      expect(findEntry("sessions-compact").definition.aliases).toEqual(["compact-session"]);
    });

    it("sessions args kind 为 enum 且含 5 个 choices", () => {
      const arg = findEntry("sessions").definition.args?.[0];
      expect(arg?.name).toBe("kind");
      expect(arg?.type).toBe("enum");
      expect(arg?.choices).toHaveLength(5);
      expect(arg?.defaultValue).toBe("all");
    });

    it("sessions-cleanup args olderThanDays/dryRun 均有默认值", () => {
      const def = findEntry("sessions-cleanup").definition;
      const daysArg = def.args?.[0];
      const dryRunArg = def.args?.[1];
      expect(daysArg?.defaultValue).toBe(30);
      expect(dryRunArg?.defaultValue).toBe(true);
    });

    it("sessions-tail args n 默认 20", () => {
      const arg = findEntry("sessions-tail").definition.args?.[0];
      expect(arg?.name).toBe("n");
      expect(arg?.defaultValue).toBe(20);
    });
  });

  describe("sessions handler", () => {
    it("kind=all 返回包含当前会话的 rows 列表", () => {
      const { handler } = findEntry("sessions");
      const res = handler(ctx({ sessionKey: "chat:abc", args: { kind: "all" } }));
      expect(res.ok).toBe(true);
      const data = res.data as { rows: SessionRow[]; filter: string; total: number };
      expect(data.rows.length).toBe(1);
      expect(data.rows[0].key).toBe("chat:abc");
      expect(data.rows[0].kind).toBe("chat");
      expect(data.filter).toBe("all");
      expect(data.total).toBe(1);
    });

    it("未传 kind 时默认 all", () => {
      const { handler } = findEntry("sessions");
      const res = handler(ctx({ args: {} }));
      const data = res.data as { filter: string };
      expect(data.filter).toBe("all");
    });

    it("message 包含会话数量与 filter", () => {
      const { handler } = findEntry("sessions");
      const res = handler(ctx({ args: { kind: "task" } }));
      expect(res.message).toContain("1 个会话");
      expect(res.message).toContain("filter=task");
    });

    it("row 的 updatedAt 取自 ctx.timestamp", () => {
      const { handler } = findEntry("sessions");
      const res = handler(ctx({ timestamp: 1234567890, args: { kind: "all" } }));
      const data = res.data as { rows: SessionRow[] };
      expect(data.rows[0].updatedAt).toBe(1234567890);
    });
  });

  describe("sessions-cleanup handler", () => {
    it("dryRun=true 返回未实际删除提示", () => {
      const { handler } = findEntry("sessions-cleanup");
      const res = handler(ctx({ args: { olderThanDays: 30, dryRun: true } }));
      expect(res.ok).toBe(true);
      expect(res.message).toContain("dry-run");
      const data = res.data as { olderThanDays: number; dryRun: boolean; removed: number };
      expect(data.dryRun).toBe(true);
      expect(data.removed).toBe(0);
    });

    it("dryRun=false 返回已清理提示", () => {
      const { handler } = findEntry("sessions-cleanup");
      const res = handler(ctx({ args: { olderThanDays: 7, dryRun: false } }));
      expect(res.message).toContain("已清理");
      const data = res.data as { olderThanDays: number; dryRun: boolean };
      expect(data.dryRun).toBe(false);
      expect(data.olderThanDays).toBe(7);
    });

    it("未传参数使用默认值 olderThanDays=30 dryRun=true", () => {
      const { handler } = findEntry("sessions-cleanup");
      const res = handler(ctx({ args: {} }));
      const data = res.data as { olderThanDays: number; dryRun: boolean };
      expect(data.olderThanDays).toBe(30);
      expect(data.dryRun).toBe(true);
    });

    it("olderThanDays 为字符串数字时被 Number 转换", () => {
      const { handler } = findEntry("sessions-cleanup");
      const res = handler(ctx({ args: { olderThanDays: "14" as unknown as number, dryRun: false } }));
      const data = res.data as { olderThanDays: number };
      expect(data.olderThanDays).toBe(14);
    });
  });

  describe("sessions-compact handler", () => {
    it("未传 key 时使用 ctx.sessionKey", () => {
      const { handler } = findEntry("sessions-compact");
      const res = handler(ctx({ sessionKey: "chat:default", args: {} }));
      expect(res.ok).toBe(true);
      expect(res.message).toContain("chat:default");
      expect(res.actions?.[0]).toEqual({
        type: "clear_session",
        payload: { key: "chat:default", mode: "compact" },
      });
    });

    it("传 key 时使用传入的 key", () => {
      const { handler } = findEntry("sessions-compact");
      const res = handler(ctx({ args: { key: "chat:target" } }));
      expect(res.message).toContain("chat:target");
      const action = res.actions?.[0] as { payload: { key: string; mode: string } };
      expect(action.payload.key).toBe("chat:target");
      expect(action.payload.mode).toBe("compact");
    });
  });

  describe("sessions-tail handler", () => {
    it("未传参数使用默认 n=20 与 ctx.sessionKey", () => {
      const { handler } = findEntry("sessions-tail");
      const res = handler(ctx({ sessionKey: "chat:abc", args: {} }));
      expect(res.ok).toBe(true);
      expect(res.message).toContain("20 条");
      expect(res.message).toContain("chat:abc");
      const data = res.data as { key: string; count: number; messages: unknown[] };
      expect(data.count).toBe(0);
      expect(data.messages).toEqual([]);
    });

    it("传 n 与 key 时使用传入值", () => {
      const { handler } = findEntry("sessions-tail");
      const res = handler(ctx({ args: { n: 50, key: "chat:xyz" } }));
      expect(res.message).toContain("50 条");
      expect(res.message).toContain("chat:xyz");
      const data = res.data as { key: string };
      expect(data.key).toBe("chat:xyz");
    });

    it("n 为字符串数字时被转换", () => {
      const { handler } = findEntry("sessions-tail");
      const res = handler(ctx({ args: { n: "100" as unknown as number } }));
      expect(res.message).toContain("100 条");
    });
  });

  describe("registerSessionsCommands", () => {
    beforeEach(() => {
      resetCommandRegistryForTests();
    });

    it("注册 4 个命令到 registry", () => {
      registerSessionsCommands();
      const reg = getCommandRegistry();
      expect(reg.size()).toBe(4);
      expect(reg.has("sessions")).toBe(true);
      expect(reg.has("sessions-cleanup")).toBe(true);
      expect(reg.has("sessions-compact")).toBe(true);
      expect(reg.has("sessions-tail")).toBe(true);
    });

    it("sessions 别名 sessions-list 可解析", () => {
      registerSessionsCommands();
      const reg = getCommandRegistry();
      expect(reg.get("sessions-list")?.name).toBe("sessions");
    });

    it("sessions-compact 别名 compact-session 可解析", () => {
      registerSessionsCommands();
      const reg = getCommandRegistry();
      expect(reg.get("compact-session")?.name).toBe("sessions-compact");
    });
  });
});
