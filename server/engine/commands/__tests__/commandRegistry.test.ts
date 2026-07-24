import { describe, it, expect, beforeEach } from "vitest";
import {
  getCommandRegistry,
  registerCommand,
  unregisterCommand,
  executeCommand,
  listCommands,
  resetCommandRegistryForTests,
  type ChatCommandDefinition,
  type CommandExecutionContext,
} from "../commandRegistry.js";

const noopHandler = () => ({ ok: true });

function makeDefinition(name: string, overrides: Partial<ChatCommandDefinition> = {}): ChatCommandDefinition {
  return {
    name,
    description: `${name} 命令`,
    category: "utility",
    scope: "chat",
    ...overrides,
  };
}

const baseCtx: Omit<CommandExecutionContext, "args" | "rawArgs"> = {
  sessionKey: "chat:test",
  userId: "u-1",
  message: "/echo hi",
  timestamp: Date.now(),
};

describe("CommandRegistry", () => {
  beforeEach(() => {
    resetCommandRegistryForTests();
  });

  describe("register / get / has", () => {
    it("register 后可通过 get 取回并 has 返回 true", () => {
      registerCommand(makeDefinition("ping"), noopHandler);
      const reg = getCommandRegistry();
      expect(reg.has("ping")).toBe(true);
      expect(reg.get("ping")?.name).toBe("ping");
    });

    it("未注册的命令 get 返回 undefined 且 has 返回 false", () => {
      const reg = getCommandRegistry();
      expect(reg.get("not-exists")).toBeUndefined();
      expect(reg.has("not-exists")).toBe(false);
    });

    it("register 后命令名大小写不敏感（统一小写存储）", () => {
      registerCommand(makeDefinition("Ping"), noopHandler);
      const reg = getCommandRegistry();
      expect(reg.has("ping")).toBe(true);
      expect(reg.has("PING")).toBe(true);
      expect(reg.has("Ping")).toBe(true);
    });

    it("register 后可通过 / 前缀获取命令", () => {
      registerCommand(makeDefinition("ping"), noopHandler);
      const reg = getCommandRegistry();
      expect(reg.get("/ping")?.name).toBe("ping");
    });

    it("enabledByDefault 未声明时默认为 true", () => {
      registerCommand(makeDefinition("ping"), noopHandler);
      expect(getCommandRegistry().get("ping")?.enabledByDefault).toBe(true);
    });

    it("aliases 注册后可被解析到主命令", () => {
      registerCommand(
        makeDefinition("ping", { aliases: ["p", "pg"] }),
        noopHandler,
      );
      const reg = getCommandRegistry();
      expect(reg.get("p")?.name).toBe("ping");
      expect(reg.get("pg")?.name).toBe("ping");
    });

    it("aliases 大小写不敏感", () => {
      registerCommand(makeDefinition("ping", { aliases: ["P"] }), noopHandler);
      expect(getCommandRegistry().get("p")?.name).toBe("ping");
      expect(getCommandRegistry().get("P")?.name).toBe("ping");
    });
  });

  describe("unregister", () => {
    it("unregister 已注册命令返回 true 并移除", () => {
      registerCommand(makeDefinition("ping"), noopHandler);
      expect(unregisterCommand("ping")).toBe(true);
      expect(getCommandRegistry().has("ping")).toBe(false);
    });

    it("unregister 同时移除其别名映射", () => {
      registerCommand(makeDefinition("ping", { aliases: ["p"] }), noopHandler);
      expect(unregisterCommand("ping")).toBe(true);
      expect(getCommandRegistry().get("p")).toBeUndefined();
    });

    it("unregister 不存在的命令返回 false", () => {
      expect(unregisterCommand("ghost")).toBe(false);
    });

    it("unregister 大小写不敏感", () => {
      registerCommand(makeDefinition("ping"), noopHandler);
      expect(unregisterCommand("PING")).toBe(true);
      expect(getCommandRegistry().has("ping")).toBe(false);
    });
  });

  describe("size / clear", () => {
    it("size 反映已注册命令数量", () => {
      registerCommand(makeDefinition("a"), noopHandler);
      registerCommand(makeDefinition("b"), noopHandler);
      expect(getCommandRegistry().size()).toBe(2);
    });

    it("clear 后 size 为 0 且别名也被清空", () => {
      registerCommand(makeDefinition("a", { aliases: ["x"] }), noopHandler);
      const reg = getCommandRegistry();
      reg.clear();
      expect(reg.size()).toBe(0);
      expect(reg.get("x")).toBeUndefined();
    });
  });

  describe("list", () => {
    beforeEach(() => {
      registerCommand(makeDefinition("beta", { category: "session", hidden: false }), noopHandler);
      registerCommand(makeDefinition("alpha", { category: "utility", hidden: false }), noopHandler);
      registerCommand(makeDefinition("hidden-one", { category: "utility", hidden: true }), noopHandler);
    });

    it("默认排除 hidden 命令", () => {
      const names = listCommands().map((c) => c.name);
      expect(names).toEqual(["alpha", "beta"]);
    });

    it("includeHidden=true 包含 hidden 命令", () => {
      const names = listCommands({ includeHidden: true }).map((c) => c.name);
      expect(names).toEqual(["alpha", "beta", "hidden-one"]);
    });

    it("按 category 过滤", () => {
      const names = listCommands({ category: "session" }).map((c) => c.name);
      expect(names).toEqual(["beta"]);
    });

    it("按 scope 过滤（字符串 scope 命中）", () => {
      const names = listCommands({ scope: "chat" }).map((c) => c.name);
      expect(names).toContain("alpha");
      expect(names).toContain("beta");
    });

    it("按 scope 过滤命中数组 scope 命令", () => {
      registerCommand(makeDefinition("multi", { scope: ["chat", "admin"] }), noopHandler);
      const names = listCommands({ scope: "admin" }).map((c) => c.name);
      expect(names).toContain("multi");
      expect(names).not.toContain("alpha");
    });

    it("结果按 name 字母序排序", () => {
      const names = listCommands({ includeHidden: true }).map((c) => c.name);
      expect(names).toEqual([...names].sort());
    });
  });

  describe("listCategories", () => {
    it("返回去重排序后的 category 列表", () => {
      registerCommand(makeDefinition("a", { category: "session" }), noopHandler);
      registerCommand(makeDefinition("b", { category: "utility" }), noopHandler);
      registerCommand(makeDefinition("c", { category: "agent" }), noopHandler);
      expect(getCommandRegistry().listCategories()).toEqual(["agent", "session", "utility"]);
    });

    it("无命令时返回空数组", () => {
      expect(getCommandRegistry().listCategories()).toEqual([]);
    });
  });

  describe("execute", () => {
    it("未以 / 开头返回 Invalid command format", async () => {
      const res = await executeCommand("ping", baseCtx);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("Invalid command format");
    });

    it("未知命令返回 Unknown command 错误", async () => {
      const res = await executeCommand("/ghost", baseCtx);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("Unknown command: /ghost");
    });

    it("正确执行同步 handler 并传递解析后的 args", async () => {
      let received: CommandExecutionContext | undefined;
      registerCommand(
        makeDefinition("echo", {
          args: [{ name: "text", description: "x", type: "string", required: true }],
        }),
        (ctx) => {
          received = ctx;
          return { ok: true, message: ctx.args.text as string };
        },
      );
      const res = await executeCommand("/echo hello", baseCtx);
      expect(res.ok).toBe(true);
      expect(res.message).toBe("hello");
      expect(received?.rawArgs).toBe("hello");
      expect(received?.args.text).toBe("hello");
      expect(received?.sessionKey).toBe("chat:test");
    });

    it("支持异步 handler", async () => {
      registerCommand(makeDefinition("async"), async () => ({
        ok: true,
        message: "async-result",
      }));
      const res = await executeCommand("/async", baseCtx);
      expect(res.ok).toBe(true);
      expect(res.message).toBe("async-result");
    });

    it("handler 抛错时被捕获并返回 error", async () => {
      registerCommand(makeDefinition("boom"), () => {
        throw new Error("boom-error");
      });
      const res = await executeCommand("/boom", baseCtx);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("boom-error");
    });

    it("handler 抛非 Error 时被捕获并字符串化", async () => {
      registerCommand(makeDefinition("boom2"), () => {
        throw "string-error";
      });
      const res = await executeCommand("/boom2", baseCtx);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("string-error");
    });

    it("空 argsText 时跳过 required 校验（当前行为：单必填参数不传时不报错）", async () => {
      registerCommand(
        makeDefinition("need-arg", {
          args: [{ name: "key", description: "x", type: "string", required: true }],
        }),
        () => ({ ok: true }),
      );
      const res = await executeCommand("/need-arg", baseCtx);
      expect(res.ok).toBe(true);
    });

    it("多必填参数且 tokens 不足时抛出 Missing required argument", async () => {
      registerCommand(
        makeDefinition("need-two", {
          args: [
            { name: "a", description: "x", type: "string", required: true },
            { name: "b", description: "y", type: "string", required: true },
          ],
        }),
        () => ({ ok: true }),
      );
      // parseArgs 在 try/catch 之外调用，因此错误以 reject 形式抛出
      await expect(executeCommand("/need-two only-one", baseCtx)).rejects.toThrow(
        "Missing required argument: b",
      );
    });

    it("无参数命令仅传入空 args", async () => {
      let observedArgs: unknown;
      registerCommand(makeDefinition("noarg"), (ctx) => {
        observedArgs = ctx.args;
        return { ok: true };
      });
      await executeCommand("/noarg", baseCtx);
      expect(observedArgs).toEqual({});
    });

    it("带默认值的参数在未提供时填充默认值", async () => {
      registerCommand(
        makeDefinition("def", {
          args: [{ name: "mode", description: "x", type: "string", defaultValue: "auto" }],
        }),
        (ctx) => ({ ok: true, message: ctx.args.mode as string }),
      );
      const res = await executeCommand("/def", baseCtx);
      expect(res.message).toBe("auto");
    });

    it("number 类型参数被强制转换", async () => {
      registerCommand(
        makeDefinition("num", {
          args: [{ name: "n", description: "x", type: "number" }],
        }),
        (ctx) => ({ ok: true, data: ctx.args.n }),
      );
      const res = await executeCommand("/num 42", baseCtx);
      expect(res.data).toBe(42);
    });

    it("number 类型转换失败时抛出错误（parseArgs 在 try/catch 之外）", async () => {
      registerCommand(
        makeDefinition("num2", {
          args: [{ name: "n", description: "x", type: "number" }],
        }),
        () => ({ ok: true }),
      );
      await expect(executeCommand("/num2 abc", baseCtx)).rejects.toThrow("Invalid number");
    });

    it("boolean 类型支持多种字面量", async () => {
      registerCommand(
        makeDefinition("bool", {
          args: [{ name: "flag", description: "x", type: "boolean" }],
        }),
        (ctx) => ({ ok: true, data: ctx.args.flag }),
      );
      const on = await executeCommand("/bool true", baseCtx);
      expect(on.data).toBe(true);
      const off = await executeCommand("/bool no", baseCtx);
      expect(off.data).toBe(false);
    });

    it("boolean 非法值抛出错误", async () => {
      registerCommand(
        makeDefinition("bool2", {
          args: [{ name: "flag", description: "x", type: "boolean" }],
        }),
        () => ({ ok: true }),
      );
      await expect(executeCommand("/bool2 maybe", baseCtx)).rejects.toThrow("Invalid boolean");
    });

    it("enum 类型校验 choices", async () => {
      registerCommand(
        makeDefinition("en", {
          args: [
            {
              name: "mode",
              description: "x",
              type: "enum",
              choices: [{ value: "on", label: "On" }, { value: "off", label: "Off" }],
            },
          ],
        }),
        (ctx) => ({ ok: true, data: ctx.args.mode }),
      );
      const ok = await executeCommand("/en on", baseCtx);
      expect(ok.data).toBe("on");
      // 非法 enum 值在 parseArgs 阶段抛出（try/catch 之外）
      await expect(executeCommand("/en bad", baseCtx)).rejects.toThrow("Invalid value");
    });

    it("带引号的参数被正确 tokenize", async () => {
      registerCommand(
        makeDefinition("q", {
          args: [{ name: "text", description: "x", type: "string" }],
        }),
        (ctx) => ({ ok: true, data: ctx.args.text }),
      );
      const res = await executeCommand('/q "hello world"', baseCtx);
      expect(res.data).toBe("hello world");
    });

    it("命令前后空白被 trim", async () => {
      registerCommand(makeDefinition("trim"), () => ({ ok: true, message: "ok" }));
      const res = await executeCommand("   /trim   ", baseCtx);
      expect(res.ok).toBe(true);
      expect(res.message).toBe("ok");
    });

    it("别名在 execute 中可被解析", async () => {
      registerCommand(
        makeDefinition("full", { aliases: ["f"] }),
        () => ({ ok: true, message: "full-ok" }),
      );
      const res = await executeCommand("/f", baseCtx);
      expect(res.ok).toBe(true);
      expect(res.message).toBe("full-ok");
    });

    it("仅 / 没有命令名时返回 Invalid command format", async () => {
      const res = await executeCommand("/", baseCtx);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("Invalid command format");
    });
  });

  describe("resetCommandRegistryForTests", () => {
    it("调用后清空所有注册项", () => {
      registerCommand(makeDefinition("a"), noopHandler);
      expect(getCommandRegistry().size()).toBe(1);
      resetCommandRegistryForTests();
      expect(getCommandRegistry().size()).toBe(0);
    });
  });
});
