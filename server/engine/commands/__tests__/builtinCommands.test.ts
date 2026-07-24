import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  builtinCommands,
  doctorCommands,
  statusCommands,
  onboardCommands,
  sessionsCommands,
  configureCommands,
  registerBuiltinCommands,
} from "../builtinCommands.js";
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

function findHandler(name: string) {
  const entry = builtinCommands.find((c) => c.definition.name === name);
  if (!entry) throw new Error(`builtin command ${name} not found`);
  return entry;
}

describe("builtinCommands", () => {
  describe("导出结构", () => {
    it("builtinCommands 是非空数组且每项含 definition 与 handler", () => {
      expect(Array.isArray(builtinCommands)).toBe(true);
      expect(builtinCommands.length).toBeGreaterThan(0);
      for (const c of builtinCommands) {
        expect(c.definition).toBeTruthy();
        expect(typeof c.handler).toBe("function");
      }
    });

    it("包含 /model /new /clear /help /version 等核心命令", () => {
      const names = builtinCommands.map((c) => c.definition.name);
      for (const n of ["model", "models", "new", "clear", "help", "version"]) {
        expect(names).toContain(n);
      }
    });

    it("每个 definition 都有非空 name/description/category/scope", () => {
      for (const c of builtinCommands) {
        expect(c.definition.name.length).toBeGreaterThan(0);
        expect(c.definition.description.length).toBeGreaterThan(0);
        expect(c.definition.category).toBeTruthy();
        expect(c.definition.scope).toBeTruthy();
      }
    });

    it("re-export 子命令族数组非空", () => {
      expect(doctorCommands.length).toBeGreaterThan(0);
      expect(statusCommands.length).toBeGreaterThan(0);
      expect(onboardCommands.length).toBeGreaterThan(0);
      expect(sessionsCommands.length).toBeGreaterThan(0);
      expect(configureCommands.length).toBeGreaterThan(0);
    });
  });

  describe("model 命令", () => {
    it("无 rawArgs 时返回当前模型信息", () => {
      const { handler } = findHandler("model");
      const res = handler(ctx({ rawArgs: "" }));
      expect(res.ok).toBe(true);
      expect(res.message).toContain("当前模型");
    });

    it("带 modelId 时返回切换结果与 set_model action", () => {
      const { handler } = findHandler("model");
      const res = handler(ctx({ rawArgs: "gpt-4o", args: { modelId: "gpt-4o" } }));
      expect(res.ok).toBe(true);
      expect(res.message).toContain("gpt-4o");
      expect(res.actions?.[0]).toEqual({ type: "set_model", payload: "gpt-4o" });
    });
  });

  describe("models 命令", () => {
    it("返回模型列表数据", () => {
      const { handler } = findHandler("models");
      const res = handler(ctx());
      expect(res.ok).toBe(true);
      const data = res.data as { models: Array<{ id: string }> };
      expect(data.models.length).toBeGreaterThan(0);
      expect(data.models.some((m) => m.id === "gpt-4o")).toBe(true);
    });
  });

  describe("thinking 命令", () => {
    it("回显传入的思考模式", () => {
      const { handler } = findHandler("thinking");
      const res = handler(ctx({ args: { mode: "on" } }));
      expect(res.ok).toBe(true);
      expect(res.message).toContain("on");
    });

    it("默认值 auto 在未传时由 registry 填充（这里手动传 auto）", () => {
      const { handler } = findHandler("thinking");
      const res = handler(ctx({ args: { mode: "auto" } }));
      expect(res.message).toContain("auto");
    });
  });

  describe("session 命令族", () => {
    it("new 返回 navigate action", () => {
      const { handler } = findHandler("new");
      const res = handler(ctx());
      expect(res.ok).toBe(true);
      expect(res.actions?.[0]?.type).toBe("navigate");
    });

    it("clear 返回 clear_session action", () => {
      const { handler } = findHandler("clear");
      const res = handler(ctx());
      expect(res.actions?.[0]?.type).toBe("clear_session");
    });

    it("compact 仅返回消息", () => {
      const { handler } = findHandler("compact");
      const res = handler(ctx());
      expect(res.ok).toBe(true);
      expect(res.message).toContain("压缩");
      expect(res.actions).toBeUndefined();
    });

    it("context 返回包含 sessionKey 的 data", () => {
      const { handler } = findHandler("context");
      const res = handler(ctx({ sessionKey: "chat:abc" }));
      const data = res.data as { sessionKey: string };
      expect(data.sessionKey).toBe("chat:abc");
    });

    it("rename 回显新名称", () => {
      const { handler } = findHandler("rename");
      const res = handler(ctx({ args: { name: "新名" } }));
      expect(res.message).toContain("新名");
    });

    it("delete 返回 navigate /", () => {
      const { handler } = findHandler("delete");
      const res = handler(ctx());
      expect(res.actions?.[0]).toEqual({ type: "navigate", payload: "/" });
    });
  });

  describe("agent 命令", () => {
    it("无 rawArgs 返回 currentAgent 与 availableAgents", () => {
      const { handler } = findHandler("agent");
      const res = handler(ctx({ rawArgs: "" }));
      const data = res.data as { currentAgent: string; availableAgents: unknown[] };
      expect(data.currentAgent).toBeTruthy();
      expect(data.availableAgents.length).toBeGreaterThan(0);
    });

    it("带 agentId 返回切换消息", () => {
      const { handler } = findHandler("agent");
      const res = handler(ctx({ rawArgs: "wms-expert", args: { agentId: "wms-expert" } }));
      expect(res.message).toContain("wms-expert");
    });
  });

  describe("agents 命令", () => {
    it("返回 agents 列表", () => {
      const { handler } = findHandler("agents");
      const res = handler(ctx());
      const data = res.data as { agents: Array<{ id: string }> };
      expect(data.agents.length).toBeGreaterThan(0);
    });
  });

  describe("help 命令", () => {
    it("返回多行帮助文本且包含 /model", () => {
      const { handler } = findHandler("help");
      const res = handler(ctx());
      expect(res.ok).toBe(true);
      expect(res.message).toContain("/model");
      expect(res.message.split("\n").length).toBeGreaterThan(3);
    });
  });

  describe("debug 命令", () => {
    it("回显调试模式（hidden 命令仍可调用）", () => {
      const entry = builtinCommands.find((c) => c.definition.name === "debug");
      expect(entry?.definition.hidden).toBe(true);
      const res = entry!.handler(ctx({ args: { mode: "on" } }));
      expect(res.message).toContain("on");
    });
  });

  describe("version 命令", () => {
    it("返回版本与 build 数据", () => {
      const { handler } = findHandler("version");
      const res = handler(ctx());
      const data = res.data as { version: string; build: string; engine: string };
      expect(data.version).toBeTruthy();
      expect(data.build).toBeTruthy();
      expect(data.engine).toBeTruthy();
    });
  });

  describe("echo 命令", () => {
    it("回显输入文本", () => {
      const { handler } = findHandler("echo");
      const res = handler(ctx({ args: { text: "Hello World" } }));
      expect(res.message).toBe("Hello World");
    });

    it("未传 text 时回显 undefined（行为校验）", () => {
      const { handler } = findHandler("echo");
      const res = handler(ctx({ args: {} }));
      expect(res.ok).toBe(true);
      expect(res.message).toBeUndefined();
    });
  });

  describe("uptime 命令", () => {
    afterEach(() => {
      delete (globalThis as { serverStartTime?: number }).serverStartTime;
    });

    it("serverStartTime 设为当前时间时返回 0 小时", () => {
      (globalThis as { serverStartTime?: number }).serverStartTime = Date.now();
      const { handler } = findHandler("uptime");
      const res = handler(ctx());
      expect(res.ok).toBe(true);
      expect(res.message).toContain("0小时");
    });

    it("设置 serverStartTime 为 2 小时前返回非零运行时间", () => {
      (globalThis as { serverStartTime?: number }).serverStartTime = Date.now() - 7200000; // 2h
      const { handler } = findHandler("uptime");
      const res = handler(ctx());
      expect(res.message).toMatch(/运行时间: \d+小时/);
    });

    it("未设置 serverStartTime 时（?? 0）返回基于 epoch 的巨大运行时间", () => {
      delete (globalThis as { serverStartTime?: number }).serverStartTime;
      const { handler } = findHandler("uptime");
      const res = handler(ctx());
      expect(res.ok).toBe(true);
      // serverStartTime undefined → ?? 0 → uptime = Date.now() - 0 = 巨大值
      expect(res.message).toMatch(/运行时间: \d+小时/);
    });
  });

  describe("reload 命令", () => {
    it("返回已重载消息", () => {
      const { handler } = findHandler("reload");
      const res = handler(ctx());
      expect(res.ok).toBe(true);
      expect(res.message).toContain("重新加载");
    });
  });

  describe("registerBuiltinCommands", () => {
    beforeEach(() => {
      resetCommandRegistryForTests();
    });

    it("注册后 registry size 等于所有命令族之和", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      registerBuiltinCommands();
      const reg = getCommandRegistry();
      const expected =
        builtinCommands.length +
        doctorCommands.length +
        statusCommands.length +
        onboardCommands.length +
        sessionsCommands.length +
        configureCommands.length;
      expect(reg.size()).toBe(expected);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(`Registered ${expected} built-in commands`));
      logSpy.mockRestore();
    });

    it("重复调用 registerBuiltinCommands 不会增加 size（覆盖注册）", () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      registerBuiltinCommands();
      const size1 = getCommandRegistry().size();
      registerBuiltinCommands();
      const size2 = getCommandRegistry().size();
      expect(size2).toBe(size1);
      vi.restoreAllMocks();
    });
  });
});
