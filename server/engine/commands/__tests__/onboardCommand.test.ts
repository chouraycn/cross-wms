import { describe, it, expect, beforeEach } from "vitest";
import {
  onboardCommands,
  registerOnboardCommands,
  ONBOARD_STEPS,
  type OnboardStep,
} from "../onboard/onboardCommand.js";
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
  const entry = onboardCommands.find((c) => c.definition.name === name);
  if (!entry) throw new Error(`onboard command ${name} not found`);
  return entry;
}

describe("onboardCommand", () => {
  describe("导出结构", () => {
    it("onboardCommands 含 4 个命令", () => {
      expect(onboardCommands).toHaveLength(4);
      const names = onboardCommands.map((c) => c.definition.name);
      expect(names).toEqual(
        expect.arrayContaining(["onboard", "onboard-step", "onboard-channels", "onboard-hooks"]),
      );
    });

    it("所有命令 category=onboard", () => {
      for (const c of onboardCommands) {
        expect(c.definition.category).toBe("onboard");
      }
    });

    it("onboard 命令带 aliases setup/welcome", () => {
      expect(findEntry("onboard").definition.aliases).toEqual(["setup", "welcome"]);
    });

    it("onboard-step 是 hidden 命令", () => {
      expect(findEntry("onboard-step").definition.hidden).toBe(true);
    });

    it("onboard args interactive 默认值为 true", () => {
      const arg = findEntry("onboard").definition.args?.[0];
      expect(arg?.name).toBe("interactive");
      expect(arg?.type).toBe("boolean");
      expect(arg?.defaultValue).toBe(true);
    });

    it("onboard-step args step 为 required string", () => {
      const arg = findEntry("onboard-step").definition.args?.[0];
      expect(arg?.name).toBe("step");
      expect(arg?.required).toBe(true);
    });
  });

  describe("ONBOARD_STEPS", () => {
    it("包含 7 个步骤且首步为 welcome 末步为 finish", () => {
      expect(ONBOARD_STEPS).toHaveLength(7);
      expect(ONBOARD_STEPS[0].id).toBe("welcome");
      expect(ONBOARD_STEPS[ONBOARD_STEPS.length - 1].id).toBe("finish");
    });

    it("所有步骤含 id/title/description 且 completed=false", () => {
      for (const s of ONBOARD_STEPS) {
        expect(s.id.length).toBeGreaterThan(0);
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.description.length).toBeGreaterThan(0);
        expect(s.completed).toBe(false);
      }
    });

    it("必填步骤包含 welcome/workspace/model/finish", () => {
      const required = ONBOARD_STEPS.filter((s) => s.required).map((s) => s.id);
      expect(required).toEqual(
        expect.arrayContaining(["welcome", "workspace", "model", "finish"]),
      );
    });

    it("secrets/channels/hooks 为非必填步骤", () => {
      const optional = ONBOARD_STEPS.filter((s) => !s.required).map((s) => s.id);
      expect(optional).toEqual(expect.arrayContaining(["secrets", "channels", "hooks"]));
    });
  });

  describe("onboard handler", () => {
    it("interactive=true（默认）返回交互模式消息", () => {
      const { handler } = findEntry("onboard");
      const res = handler(ctx({ args: { interactive: true } }));
      expect(res.ok).toBe(true);
      expect(res.message).toContain("引导流程");
      const data = res.data as { interactive: boolean; steps: OnboardStep[]; currentStep: string };
      expect(data.interactive).toBe(true);
      expect(data.steps).toHaveLength(7);
      expect(data.currentStep).toBe("welcome");
    });

    it("interactive=false 返回非交互模式消息", () => {
      const { handler } = findEntry("onboard");
      const res = handler(ctx({ args: { interactive: false } }));
      expect(res.ok).toBe(true);
      expect(res.message).toContain("非交互");
      const data = res.data as { interactive: boolean };
      expect(data.interactive).toBe(false);
    });

    it("返回 open_modal action payload=onboard-wizard", () => {
      const { handler } = findEntry("onboard");
      const res = handler(ctx());
      const data = res.data as { actions: Array<{ type: string; payload: string }> };
      expect(data.actions?.[0]).toEqual({ type: "open_modal", payload: "onboard-wizard" });
    });

    it("未传 args 时默认 interactive=true", () => {
      const { handler } = findEntry("onboard");
      const res = handler(ctx({ args: {} }));
      const data = res.data as { interactive: boolean };
      expect(data.interactive).toBe(true);
    });
  });

  describe("onboard-step handler", () => {
    it("合法 stepId 返回该步骤详情与 totalSteps", () => {
      const { handler } = findEntry("onboard-step");
      const res = handler(ctx({ args: { step: "model" } }));
      expect(res.ok).toBe(true);
      const data = res.data as { step: OnboardStep; totalSteps: number };
      expect(data.step.id).toBe("model");
      expect(data.totalSteps).toBe(7);
      expect(res.actions?.[0]).toEqual({ type: "navigate", payload: "/onboard/model" });
    });

    it("未传 step 默认 welcome", () => {
      const { handler } = findEntry("onboard-step");
      const res = handler(ctx({ args: {} }));
      const data = res.data as { step: OnboardStep };
      expect(data.step.id).toBe("welcome");
    });

    it("非法 stepId 返回 ok=false 且 error 列出可用步骤", () => {
      const { handler } = findEntry("onboard-step");
      const res = handler(ctx({ args: { step: "not-a-step" } }));
      expect(res.ok).toBe(false);
      expect(res.error).toContain("Unknown onboard step");
      expect(res.error).toContain("welcome");
    });
  });

  describe("onboard-channels handler", () => {
    it("返回 open_modal payload=onboard-channels", () => {
      const { handler } = findEntry("onboard-channels");
      const res = handler(ctx());
      expect(res.ok).toBe(true);
      expect(res.message).toContain("渠道");
      expect(res.actions?.[0]).toEqual({ type: "open_modal", payload: "onboard-channels" });
    });
  });

  describe("onboard-hooks handler", () => {
    it("返回 open_modal payload=onboard-hooks", () => {
      const { handler } = findEntry("onboard-hooks");
      const res = handler(ctx());
      expect(res.ok).toBe(true);
      expect(res.message).toContain("hooks");
      expect(res.actions?.[0]).toEqual({ type: "open_modal", payload: "onboard-hooks" });
    });
  });

  describe("registerOnboardCommands", () => {
    beforeEach(() => {
      resetCommandRegistryForTests();
    });

    it("注册 4 个命令到 registry", () => {
      registerOnboardCommands();
      const reg = getCommandRegistry();
      expect(reg.size()).toBe(4);
      expect(reg.has("onboard")).toBe(true);
      expect(reg.has("onboard-step")).toBe(true);
      expect(reg.has("onboard-channels")).toBe(true);
      expect(reg.has("onboard-hooks")).toBe(true);
    });

    it("onboard 别名 setup/welcome 可解析", () => {
      registerOnboardCommands();
      const reg = getCommandRegistry();
      expect(reg.get("setup")?.name).toBe("onboard");
      expect(reg.get("welcome")?.name).toBe("onboard");
    });
  });
});
