import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  statusCommands,
  registerStatusCommands,
  type RuntimeStatusSnapshot,
} from "../status/statusCommand.js";
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
  const entry = statusCommands.find((c) => c.definition.name === name);
  if (!entry) throw new Error(`status command ${name} not found`);
  return entry;
}

describe("statusCommand", () => {
  describe("导出结构", () => {
    it("statusCommands 含 4 个命令", () => {
      expect(statusCommands).toHaveLength(4);
      const names = statusCommands.map((c) => c.definition.name);
      expect(names).toEqual(
        expect.arrayContaining(["status", "status-all", "status-json", "status-update-restart"]),
      );
    });

    it("所有命令 category=status", () => {
      for (const c of statusCommands) {
        expect(c.definition.category).toBe("status");
      }
    });

    it("status 命令带别名 health", () => {
      expect(findEntry("status").definition.aliases).toEqual(["health"]);
    });

    it("status-all 命令带别名 status:all", () => {
      expect(findEntry("status-all").definition.aliases).toEqual(["status:all"]);
    });

    it("status-json 与 status-update-restart 是 hidden 命令", () => {
      expect(findEntry("status-json").definition.hidden).toBe(true);
      expect(findEntry("status-update-restart").definition.hidden).toBe(true);
    });

    it("status-all args format 为 enum 含 text/json choices", () => {
      const arg = findEntry("status-all").definition.args?.[0];
      expect(arg?.name).toBe("format");
      expect(arg?.type).toBe("enum");
      expect(arg?.choices?.map((c) => c.value)).toEqual(["text", "json"]);
      expect(arg?.defaultValue).toBe("text");
    });
  });

  describe("status handler", () => {
    it("返回 healthy 状态且 ok=true", () => {
      const { handler } = findEntry("status");
      const res = handler(ctx());
      expect(res.ok).toBe(true);
      const snap = res.data as RuntimeStatusSnapshot;
      expect(snap.status).toBe("healthy");
    });

    it("message 包含状态与活跃会话数", () => {
      const { handler } = findEntry("status");
      const res = handler(ctx({ sessionKey: "chat:1" }));
      expect(res.message).toContain("healthy");
      expect(res.message).toContain("活跃 1");
    });

    it("无 sessionKey 时 activeSessions=0", () => {
      const { handler } = findEntry("status");
      const res = handler(ctx({ sessionKey: "" }));
      const snap = res.data as RuntimeStatusSnapshot;
      expect(snap.activeSessions).toBe(0);
    });

    it("快照包含 version/build/gateway/database 字段", () => {
      const { handler } = findEntry("status");
      const res = handler(ctx());
      const snap = res.data as RuntimeStatusSnapshot;
      expect(snap.version).toBeTruthy();
      expect(snap.build).toBeTruthy();
      expect(typeof snap.gatewayReachable).toBe("boolean");
      expect(typeof snap.databaseReachable).toBe("boolean");
    });
  });

  describe("status-all handler", () => {
    it("format=text 默认返回可读文本", () => {
      const { handler } = findEntry("status-all");
      const res = handler(ctx({ args: { format: "text" } }));
      expect(res.ok).toBe(true);
      expect(res.message).toContain("runtime:");
      expect(res.message).toContain("cron:");
      const data = res.data as { runtime: unknown; cron: unknown; tasks: unknown };
      expect(data.runtime).toBeTruthy();
      expect(data.cron).toBeTruthy();
      expect(data.tasks).toBeTruthy();
    });

    it("format=json 返回可解析 JSON 字符串", () => {
      const { handler } = findEntry("status-all");
      const res = handler(ctx({ args: { format: "json" } }));
      expect(res.ok).toBe(true);
      const parsed = JSON.parse(res.message as string);
      expect(parsed.runtime).toBeTruthy();
      expect(parsed.cron).toBeTruthy();
      expect(parsed.tasks).toBeTruthy();
      expect(parsed.channels).toBeTruthy();
      expect(parsed.daemon).toBeTruthy();
    });

    it("未传 format 默认 text", () => {
      const { handler } = findEntry("status-all");
      const res = handler(ctx({ args: {} }));
      expect(res.message).toContain("runtime:");
    });

    it("data.daemon.pid 等于当前 process.pid", () => {
      const { handler } = findEntry("status-all");
      const res = handler(ctx({ args: { format: "text" } }));
      const data = res.data as { daemon: { pid: number } };
      expect(data.daemon.pid).toBe(process.pid);
    });
  });

  describe("status-json handler", () => {
    it("返回 snapshot data 且无 message", () => {
      const { handler } = findEntry("status-json");
      const res = handler(ctx());
      expect(res.ok).toBe(true);
      expect(res.message).toBeUndefined();
      const snap = res.data as RuntimeStatusSnapshot;
      expect(snap.status).toBe("healthy");
      expect(snap.version).toBeTruthy();
    });

    it("反映 ctx.sessionKey 的 activeSessions", () => {
      const { handler } = findEntry("status-json");
      const res = handler(ctx({ sessionKey: "chat:x" }));
      const snap = res.data as RuntimeStatusSnapshot;
      expect(snap.activeSessions).toBe(1);
    });
  });

  describe("status-update-restart handler", () => {
    it("返回无更新提示", () => {
      const { handler } = findEntry("status-update-restart");
      const res = handler(ctx());
      expect(res.ok).toBe(true);
      expect(res.message).toContain("最新版本");
      const data = res.data as { updateAvailable: boolean; latest: string; current: string };
      expect(data.updateAvailable).toBe(false);
      expect(data.latest).toBe(data.current);
    });
  });

  describe("uptime 解析（symbol 全局状态）", () => {
    const SERVER_START_KEY = Symbol.for("cross-wms.serverStartTime");

    afterEach(() => {
      delete (globalThis as Record<symbol, unknown>)[SERVER_START_KEY];
    });

    it("未设置 serverStartTime 时 uptimeMs=0", () => {
      delete (globalThis as Record<symbol, unknown>)[SERVER_START_KEY];
      const { handler } = findEntry("status");
      const res = handler(ctx());
      const snap = res.data as RuntimeStatusSnapshot;
      expect(snap.uptimeMs).toBe(0);
    });

    it("设置 serverStartTime 后 uptimeMs > 0", () => {
      (globalThis as Record<symbol, unknown>)[SERVER_START_KEY] = Date.now() - 5000;
      const { handler } = findEntry("status");
      const res = handler(ctx());
      const snap = res.data as RuntimeStatusSnapshot;
      expect(snap.uptimeMs).toBeGreaterThanOrEqual(5000);
    });
  });

  describe("registerStatusCommands", () => {
    beforeEach(() => {
      resetCommandRegistryForTests();
    });

    it("注册 4 个命令到 registry", () => {
      registerStatusCommands();
      const reg = getCommandRegistry();
      expect(reg.size()).toBe(4);
      expect(reg.has("status")).toBe(true);
      expect(reg.has("status-all")).toBe(true);
      expect(reg.has("status-json")).toBe(true);
      expect(reg.has("status-update-restart")).toBe(true);
    });

    it("status 别名 health 可解析", () => {
      registerStatusCommands();
      const reg = getCommandRegistry();
      expect(reg.get("health")?.name).toBe("status");
    });

    it("status-all 别名 status:all 可解析", () => {
      registerStatusCommands();
      const reg = getCommandRegistry();
      expect(reg.get("status:all")?.name).toBe("status-all");
    });
  });
});
