import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerToolHandler,
  unregisterToolHandler,
  getToolHandler,
  hasToolHandler,
  listRegisteredTools,
  dispatchSkillCommand,
  createSkillToolRegistry,
  clearToolHandlers,
} from "../runtime/tool-dispatch.js";
import type { SkillCommandSpec } from "../types.js";

describe("tool-dispatch", () => {
  beforeEach(() => {
    clearToolHandlers();
  });

  describe("registerToolHandler", () => {
    it("应该注册工具处理器", () => {
      const handler = vi.fn().mockResolvedValue({ success: true, output: "done" });
      registerToolHandler("test-tool", handler);
      expect(hasToolHandler("test-tool")).toBe(true);
      expect(getToolHandler("test-tool")).toBe(handler);
    });

    it("注册同名工具应该覆盖旧的", () => {
      const handler1 = vi.fn().mockResolvedValue({ success: true, output: "v1" });
      const handler2 = vi.fn().mockResolvedValue({ success: true, output: "v2" });
      registerToolHandler("test-tool", handler1);
      registerToolHandler("test-tool", handler2);
      expect(getToolHandler("test-tool")).toBe(handler2);
    });
  });

  describe("unregisterToolHandler", () => {
    it("应该移除已注册的工具", () => {
      const handler = vi.fn().mockResolvedValue({ success: true, output: "done" });
      registerToolHandler("test-tool", handler);
      expect(hasToolHandler("test-tool")).toBe(true);
      unregisterToolHandler("test-tool");
      expect(hasToolHandler("test-tool")).toBe(false);
    });

    it("移除不存在的工具不应该报错", () => {
      expect(() => unregisterToolHandler("nonexistent")).not.toThrow();
    });
  });

  describe("listRegisteredTools", () => {
    it("应该列出所有已注册的工具", () => {
      registerToolHandler("tool-1", vi.fn().mockResolvedValue({ success: true }));
      registerToolHandler("tool-2", vi.fn().mockResolvedValue({ success: true }));
      const tools = listRegisteredTools();
      expect(tools).toContain("tool-1");
      expect(tools).toContain("tool-2");
      expect(tools).toHaveLength(2);
    });

    it("清空后应该返回空数组", () => {
      registerToolHandler("tool-1", vi.fn().mockResolvedValue({ success: true }));
      clearToolHandlers();
      expect(listRegisteredTools()).toHaveLength(0);
    });
  });

  describe("dispatchSkillCommand", () => {
    it("应该分派到已注册的处理器", async () => {
      const handler = vi.fn().mockResolvedValue({ success: true, output: "success" });
      registerToolHandler("my-tool", handler);

      const command: SkillCommandSpec = {
        name: "my-command",
        skillName: "test-skill",
        skillKey: "test-skill",
        description: "Test command",
        dispatch: {
          kind: "tool",
          toolName: "my-tool",
        },
      };

      const result = await dispatchSkillCommand(command);
      expect(result.success).toBe(true);
      expect(result.output).toBe("success");
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        skillName: "test-skill",
        commandName: "my-command",
        toolName: "my-tool",
      }));
    });

    it("应该传递参数给处理器", async () => {
      const handler = vi.fn().mockResolvedValue({ success: true, output: "done" });
      registerToolHandler("my-tool", handler);

      const command: SkillCommandSpec = {
        name: "my-command",
        skillName: "test-skill",
        skillKey: "test-skill",
        description: "Test command",
        dispatch: {
          kind: "tool",
          toolName: "my-tool",
        },
      };
      const args = { key: "value" };

      await dispatchSkillCommand(command, args);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        args,
      }));
    });

    it("没有 dispatch 配置应该返回错误", async () => {
      const command: SkillCommandSpec = {
        name: "my-command",
        skillName: "test-skill",
        skillKey: "test-skill",
        description: "Test command",
      };
      const result = await dispatchSkillCommand(command);
      expect(result.success).toBe(false);
      expect(result.error).toContain("no dispatch tool");
    });

    it("未注册的工具应该返回错误", async () => {
      const command: SkillCommandSpec = {
        name: "my-command",
        skillName: "test-skill",
        skillKey: "test-skill",
        description: "Test command",
        dispatch: {
          kind: "tool",
          toolName: "nonexistent",
        },
      };
      const result = await dispatchSkillCommand(command);
      expect(result.success).toBe(false);
      expect(result.error).toContain("No handler");
    });

    it("处理器异常时应该返回错误", async () => {
      const handler = vi.fn().mockRejectedValue(new Error("something went wrong"));
      registerToolHandler("error-tool", handler);

      const command: SkillCommandSpec = {
        name: "my-command",
        skillName: "test-skill",
        skillKey: "test-skill",
        description: "Test command",
        dispatch: {
          kind: "tool",
          toolName: "error-tool",
        },
      };
      const result = await dispatchSkillCommand(command);
      expect(result.success).toBe(false);
      expect(result.error).toContain("something went wrong");
    });
  });

  describe("createSkillToolRegistry", () => {
    it("应该创建新的注册表", () => {
      const registry = createSkillToolRegistry();
      expect(registry).toBeDefined();
      expect(typeof registry.register).toBe("function");
      expect(typeof registry.unregister).toBe("function");
      expect(typeof registry.has).toBe("function");
      expect(typeof registry.list).toBe("function");
      expect(typeof registry.dispatch).toBe("function");
    });

    it("注册表应该可以正常工作", async () => {
      const registry = createSkillToolRegistry();
      const handler = vi.fn().mockResolvedValue({ success: true, output: "from-registry" });
      registry.register("registry-tool", handler);

      const command: SkillCommandSpec = {
        name: "my-command",
        skillName: "test-skill",
        skillKey: "test-skill",
        description: "Test command",
        dispatch: {
          kind: "tool",
          toolName: "registry-tool",
        },
      };

      const result = await registry.dispatch(command);
      expect(result.success).toBe(true);
      expect(result.output).toBe("from-registry");
      expect(registry.has("registry-tool")).toBe(true);
    });
  });
});
