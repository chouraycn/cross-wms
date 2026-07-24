import { describe, it, expect, beforeEach } from "vitest";
import {
  configureCommands,
  registerConfigureCommands,
  type ConfigureSubcommand,
} from "../configure/configureCommand.js";
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
  const entry = configureCommands.find((c) => c.definition.name === name);
  if (!entry) throw new Error(`configure command ${name} not found`);
  return entry;
}

describe("configureCommand", () => {
  describe("导出结构", () => {
    it("configureCommands 含 4 个命令且定义合法", () => {
      expect(configureCommands).toHaveLength(4);
      const names = configureCommands.map((c) => c.definition.name);
      expect(names).toEqual(
        expect.arrayContaining(["configure", "configure-set", "configure-reset", "configure-wizard"]),
      );
    });

    it("所有命令 category=configure 且 scope 含 admin", () => {
      for (const c of configureCommands) {
        expect(c.definition.category).toBe("configure");
        const scopes = Array.isArray(c.definition.scope) ? c.definition.scope : [c.definition.scope];
        expect(scopes).toContain("admin");
      }
    });

    it("configure 主命令带 aliases config/cfg", () => {
      expect(findEntry("configure").definition.aliases).toEqual(["config", "cfg"]);
    });

    it("configure-wizard 是 hidden 命令", () => {
      expect(findEntry("configure-wizard").definition.hidden).toBe(true);
    });

    it("configure 主命令 action 参数为 enum 且含 5 个 choices", () => {
      const def = findEntry("configure").definition;
      const actionArg = def.args?.[0];
      expect(actionArg?.type).toBe("enum");
      expect(actionArg?.choices).toHaveLength(5);
      expect(actionArg?.choices?.map((c) => c.value)).toEqual(
        expect.arrayContaining(["show", "validate", "set", "reset", "wizard"]),
      );
    });
  });

  describe("configure handler - show", () => {
    it("action=show 返回 KNOWN_KEYS 列表与 message", () => {
      const { handler } = findEntry("configure");
      const res = handler(ctx({ args: { action: "show" } }));
      expect(res.ok).toBe(true);
      const data = res.data as { entries: Array<{ key: string }> };
      expect(data.entries.length).toBeGreaterThan(0);
      expect(data.entries.some((e) => e.key === "engine.model")).toBe(true);
      expect(res.message).toContain("engine.model");
    });

    it("未传 action 时默认 show", () => {
      const { handler } = findEntry("configure");
      const res = handler(ctx({ args: {} }));
      expect(res.ok).toBe(true);
      expect(res.message).toContain("gateway.port");
    });
  });

  describe("configure handler - validate", () => {
    it("action=validate 返回 valid=true 与空错误列表", () => {
      const { handler } = findEntry("configure");
      const res = handler(ctx({ args: { action: "validate" as ConfigureSubcommand } }));
      expect(res.ok).toBe(true);
      const data = res.data as { valid: boolean; errors: unknown[]; warnings: unknown[] };
      expect(data.valid).toBe(true);
      expect(data.errors).toEqual([]);
      expect(data.warnings).toEqual([]);
      expect(res.message).toContain("校验通过");
    });
  });

  describe("configure handler - wizard", () => {
    it("action=wizard 返回 open_modal action", () => {
      const { handler } = findEntry("configure");
      const res = handler(ctx({ args: { action: "wizard" } }));
      expect(res.ok).toBe(true);
      expect(res.actions?.[0]).toEqual({ type: "open_modal", payload: "configure-wizard" });
    });
  });

  describe("configure handler - set", () => {
    it("action=set 提示使用 /configure-set", () => {
      const { handler } = findEntry("configure");
      const res = handler(ctx({ args: { action: "set" } }));
      expect(res.ok).toBe(true);
      expect(res.message).toContain("/configure-set");
      expect(res.actions?.[0]?.type).toBe("navigate");
    });
  });

  describe("configure handler - reset", () => {
    it("action=reset 返回 affectedKeys 列表", () => {
      const { handler } = findEntry("configure");
      const res = handler(ctx({ args: { action: "reset" } }));
      expect(res.ok).toBe(true);
      const data = res.data as { reset: boolean; affectedKeys: string[] };
      expect(data.reset).toBe(true);
      expect(data.affectedKeys.length).toBeGreaterThan(0);
    });
  });

  describe("configure-set handler", () => {
    it("提供 key/value 时返回设置成功", () => {
      const { handler } = findEntry("configure-set");
      const res = handler(ctx({ args: { key: "engine.model", value: "gpt-4o" } }));
      expect(res.ok).toBe(true);
      expect(res.message).toContain("engine.model");
      expect(res.message).toContain("gpt-4o");
      const data = res.data as { key: string; value: string; persisted: boolean };
      expect(data.key).toBe("engine.model");
      expect(data.value).toBe("gpt-4o");
      expect(data.persisted).toBe(false);
    });

    it("缺少 key 时返回 ok=false 错误", () => {
      const { handler } = findEntry("configure-set");
      const res = handler(ctx({ args: { key: "", value: "x" } }));
      expect(res.ok).toBe(false);
      expect(res.error).toContain("key");
    });

    it("未传任何参数时返回错误", () => {
      const { handler } = findEntry("configure-set");
      const res = handler(ctx({ args: {} }));
      expect(res.ok).toBe(false);
    });
  });

  describe("configure-reset handler", () => {
    it("未传 key 时重置全部", () => {
      const { handler } = findEntry("configure-reset");
      const res = handler(ctx({ args: {} }));
      expect(res.ok).toBe(true);
      expect(res.message).toContain("全部");
      const data = res.data as { key: string; reset: boolean };
      expect(data.key).toBe("*");
      expect(data.reset).toBe(true);
    });

    it("传 key 时仅重置该项", () => {
      const { handler } = findEntry("configure-reset");
      const res = handler(ctx({ args: { key: "engine.model" } }));
      expect(res.ok).toBe(true);
      expect(res.message).toContain("engine.model");
      const data = res.data as { key: string };
      expect(data.key).toBe("engine.model");
    });
  });

  describe("configure-wizard handler", () => {
    it("返回 open_modal action", () => {
      const { handler } = findEntry("configure-wizard");
      const res = handler(ctx());
      expect(res.ok).toBe(true);
      expect(res.actions?.[0]).toEqual({ type: "open_modal", payload: "configure-wizard" });
    });
  });

  describe("registerConfigureCommands", () => {
    beforeEach(() => {
      resetCommandRegistryForTests();
    });

    it("注册 4 个命令到全局 registry", () => {
      registerConfigureCommands();
      const reg = getCommandRegistry();
      expect(reg.size()).toBe(4);
      expect(reg.has("configure")).toBe(true);
      expect(reg.has("configure-set")).toBe(true);
      expect(reg.has("configure-reset")).toBe(true);
      expect(reg.has("configure-wizard")).toBe(true);
    });

    it("configure 别名 config 与 cfg 注册后可解析", () => {
      registerConfigureCommands();
      const reg = getCommandRegistry();
      expect(reg.get("config")?.name).toBe("configure");
      expect(reg.get("cfg")?.name).toBe("configure");
    });
  });
});
