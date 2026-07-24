/**
 * Onboard 命令族
 *
 * 移植自 openclaw/src/commands/onboard.ts、onboard-interactive.ts、
 * onboard-non-interactive/、onboard-channels.ts、onboard-hooks.ts 等。
 * 在 cross-wms 中简化为单条 /onboard 引导命令 + 几个子步骤命令，
 * 由 chat 前端驱动分步表单，不再保留 openclaw 复杂的 inquirer 风格。
 */

import type {
  ChatCommandDefinition,
  CommandExecutionContext,
  CommandExecutionResult,
  CommandHandler,
} from "../commandRegistry.js";
import { registerCommand } from "../commandRegistry.js";

export type OnboardStepId =
  | "welcome"
  | "workspace"
  | "model"
  | "secrets"
  | "channels"
  | "hooks"
  | "finish";

export interface OnboardStep {
  id: OnboardStepId;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
}

const ONBOARD_STEPS: OnboardStep[] = [
  { id: "welcome", title: "欢迎", description: "确认本地 engine 状态", completed: false, required: true },
  { id: "workspace", title: "工作区", description: "选择默认 workspace 目录", completed: false, required: true },
  { id: "model", title: "默认模型", description: "选择默认 LLM 提供商与模型", completed: false, required: true },
  { id: "secrets", title: "密钥", description: "配置至少一个 API key", completed: false, required: false },
  { id: "channels", title: "渠道", description: "按需启用 IM/邮件等接入", completed: false, required: false },
  { id: "hooks", title: "钩子", description: "注册自定义 hooks", completed: false, required: false },
  { id: "finish", title: "完成", description: "持久化 onboard 配置", completed: false, required: true },
];

const onboardDefinition: ChatCommandDefinition = {
  name: "onboard",
  description: "启动首次配置引导流程",
  aliases: ["setup", "welcome"],
  category: "onboard",
  scope: ["global", "admin"],
  args: [
    {
      name: "interactive",
      description: "是否以交互模式启动",
      type: "boolean",
      defaultValue: true,
    },
  ],
  examples: ["/onboard", "/onboard interactive=false"],
};

const onboardHandler: CommandHandler = (ctx) => {
  const interactive = ctx.args.interactive !== false;
  return {
    ok: true,
    message: interactive
      ? "已进入引导流程，请在右侧表单中按步骤完成配置"
      : "将以非交互模式完成全部默认配置",
    data: {
      interactive,
      steps: ONBOARD_STEPS,
      currentStep: ONBOARD_STEPS[0].id,
      actions: [{ type: "open_modal", payload: "onboard-wizard" }],
    },
  };
};

const onboardStepDefinition: ChatCommandDefinition = {
  name: "onboard-step",
  description: "查看或跳转到指定的引导步骤",
  category: "onboard",
  scope: ["global", "admin"],
  hidden: true,
  args: [
    { name: "step", description: "步骤 ID", type: "string", required: true },
  ],
  examples: ["/onboard-step model", "/onboard-step channels"],
};

const onboardStepHandler: CommandHandler = (ctx) => {
  const stepId = (ctx.args.step as OnboardStepId) ?? "welcome";
  const step = ONBOARD_STEPS.find((s) => s.id === stepId);
  if (!step) {
    return {
      ok: false,
      error: `Unknown onboard step: ${stepId}. Valid: ${ONBOARD_STEPS.map((s) => s.id).join(", ")}`,
    };
  }
  return {
    ok: true,
    data: { step, totalSteps: ONBOARD_STEPS.length },
    actions: [{ type: "navigate", payload: `/onboard/${stepId}` }],
  };
};

const onboardChannelsDefinition: ChatCommandDefinition = {
  name: "onboard-channels",
  description: "在引导流程中配置 IM/邮件/语音等渠道",
  category: "onboard",
  scope: ["global", "admin"],
  examples: ["/onboard-channels"],
};

const onboardChannelsHandler: CommandHandler = () => {
  return {
    ok: true,
    message: "已打开渠道配置面板",
    actions: [{ type: "open_modal", payload: "onboard-channels" }],
  };
};

const onboardHooksDefinition: ChatCommandDefinition = {
  name: "onboard-hooks",
  description: "在引导流程中配置自定义 hooks",
  category: "onboard",
  scope: ["global", "admin"],
  examples: ["/onboard-hooks"],
};

const onboardHooksHandler: CommandHandler = () => {
  return {
    ok: true,
    message: "已打开 hooks 配置面板",
    actions: [{ type: "open_modal", payload: "onboard-hooks" }],
  };
};

export function registerOnboardCommands(): void {
  registerCommand(onboardDefinition, onboardHandler);
  registerCommand(onboardStepDefinition, onboardStepHandler);
  registerCommand(onboardChannelsDefinition, onboardChannelsHandler);
  registerCommand(onboardHooksDefinition, onboardHooksHandler);
}

export const onboardCommands: Array<{
  definition: ChatCommandDefinition;
  handler: CommandHandler;
}> = [
  { definition: onboardDefinition, handler: onboardHandler },
  { definition: onboardStepDefinition, handler: onboardStepHandler },
  { definition: onboardChannelsDefinition, handler: onboardChannelsHandler },
  { definition: onboardHooksDefinition, handler: onboardHooksHandler },
];

export { ONBOARD_STEPS };
export type { CommandExecutionContext, CommandExecutionResult };
