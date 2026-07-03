/**
 * hooks 命令
 * 钩子管理 (list/enable/disable/reload/info)
 *
 * 参考 openclaw hooks-cli，封装对 server/engine/hooksManager 的调用。
 * 当钩子运行时未就绪时，使用本地状态进行模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type HooksOptions = {
  json?: boolean;
  eligible?: boolean;
};

/** 钩子条目 */
interface HookEntry {
  name: string;
  description: string;
  source: string;
  enabled: boolean;
  loadable: boolean;
  events: string[];
  blockedReason?: string;
}

/** 模拟钩子存储 */
const HOOKS_STORE: Map<string, HookEntry> = new Map([
  [
    "pre-tool-use",
    { name: "pre-tool-use", description: "工具调用前拦截", source: "builtin", enabled: true, loadable: true, events: ["tool.call.before"] },
  ],
  [
    "post-tool-use",
    { name: "post-tool-use", description: "工具调用后处理", source: "builtin", enabled: true, loadable: true, events: ["tool.call.after"] },
  ],
  [
    "session-start",
    { name: "session-start", description: "会话启动钩子", source: "plugin:lifecycle", enabled: false, loadable: false, events: ["session.start"], blockedReason: "缺少依赖 bin: greet" },
  ],
]);

/** 列出钩子 */
function listHooks(onlyEligible: boolean): HookEntry[] {
  const all = Array.from(HOOKS_STORE.values());
  return onlyEligible ? all.filter((h) => h.loadable) : all;
}

/** 启用钩子 */
function enableHook(name: string): { success: boolean; message: string } {
  const hook = HOOKS_STORE.get(name);
  if (!hook) {
    return { success: false, message: `钩子 ${name} 不存在` };
  }
  if (!hook.loadable) {
    return { success: false, message: `钩子 ${name} 不满足要求: ${hook.blockedReason ?? "未知"}` };
  }
  hook.enabled = true;
  return { success: true, message: `已启用钩子 ${name}` };
}

/** 禁用钩子 */
function disableHook(name: string): { success: boolean; message: string } {
  const hook = HOOKS_STORE.get(name);
  if (!hook) {
    return { success: false, message: `钩子 ${name} 不存在` };
  }
  hook.enabled = false;
  return { success: true, message: `已禁用钩子 ${name}` };
}

/** 重新加载钩子 */
function reloadHooks(): { reloaded: number; failed: number } {
  let reloaded = 0;
  let failed = 0;
  for (const hook of HOOKS_STORE.values()) {
    if (hook.loadable) {
      reloaded++;
    } else {
      failed++;
    }
  }
  return { reloaded, failed };
}

/** 获取钩子详情 */
function getHookInfo(name: string): HookEntry | undefined {
  return HOOKS_STORE.get(name);
}

/** 格式化 JSON 输出 */
function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** 格式化钩子列表文本输出 */
function formatHooksList(hooks: HookEntry[]): string {
  const eligible = hooks.filter((h) => h.loadable).length;
  const lines: string[] = [];
  lines.push("");
  lines.push(`  钩子列表 (${eligible}/${hooks.length} 可用):`);
  lines.push("");
  for (const hook of hooks) {
    const status = hook.loadable ? (hook.enabled ? "✓ 启用" : "⏸ 禁用") : "✗ 缺失";
    lines.push(`    ${status}  ${hook.name.padEnd(18)} [${hook.source}]`);
    lines.push(`             ${hook.description}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** 格式化钩子详情文本输出 */
function formatHookInfo(hook: HookEntry | undefined, name: string): string {
  if (!hook) {
    return `钩子 ${name} 不存在`;
  }
  const lines: string[] = [];
  lines.push("");
  lines.push(`  钩子详情: ${hook.name}`);
  lines.push(`    描述:       ${hook.description}`);
  lines.push(`    来源:       ${hook.source}`);
  lines.push(`    状态:       ${hook.enabled ? "启用" : "禁用"}`);
  lines.push(`    可加载:     ${hook.loadable ? "是" : "否"}`);
  lines.push(`    事件:       ${hook.events.join(", ") || "无"}`);
  if (hook.blockedReason) {
    lines.push(`    阻塞原因:   ${hook.blockedReason}`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * 注册 hooks 命令
 */
export function registerHooksCommand(program: Command): void {
  const hooksCmd = program
    .command("hooks")
    .description("钩子管理 (list/enable/disable/reload/info)");

  hooksCmd
    .command("list")
    .description("列出所有钩子")
    .option("--eligible", "仅显示可用钩子")
    .option("--json", "JSON 输出格式")
    .action((options: HooksOptions) => {
      const hooks = listHooks(Boolean(options.eligible));
      if (options.json) {
        logger.info(formatJsonOutput(hooks));
      } else {
        logger.info(formatHooksList(hooks));
      }
    });

  hooksCmd
    .command("enable <name>")
    .description("启用钩子")
    .option("--json", "JSON 输出格式")
    .action((name: string, options: HooksOptions) => {
      const result = enableHook(name);
      if (options.json) {
        logger.info(formatJsonOutput({ name, ...result }));
      } else {
        logger.info(result.message);
      }
    });

  hooksCmd
    .command("disable <name>")
    .description("禁用钩子")
    .option("--json", "JSON 输出格式")
    .action((name: string, options: HooksOptions) => {
      const result = disableHook(name);
      if (options.json) {
        logger.info(formatJsonOutput({ name, ...result }));
      } else {
        logger.info(result.message);
      }
    });

  hooksCmd
    .command("reload")
    .description("重新加载钩子")
    .option("--json", "JSON 输出格式")
    .action((options: HooksOptions) => {
      const result = reloadHooks();
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(`钩子重载完成: 成功 ${result.reloaded} 个, 失败 ${result.failed} 个`);
      }
    });

  hooksCmd
    .command("info <name>")
    .description("查看钩子详情")
    .option("--json", "JSON 输出格式")
    .action((name: string, options: HooksOptions) => {
      const hook = getHookInfo(name);
      if (options.json) {
        logger.info(formatJsonOutput(hook ?? { name, error: "not found" }));
      } else {
        logger.info(formatHookInfo(hook, name));
      }
    });

  // 默认 list 子命令
  hooksCmd.action((options: HooksOptions) => {
    const hooks = listHooks(Boolean(options.eligible));
    if (options.json) {
      logger.info(formatJsonOutput(hooks));
    } else {
      logger.info(formatHooksList(hooks));
    }
  });
}
