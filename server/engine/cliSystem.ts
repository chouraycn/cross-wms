/**
 * CLI System
 * 命令行界面系统 - 交互式命令行工具
 */

export type CliCommandCategory =
  | "general"
  | "session"
  | "agent"
  | "config"
  | "plugin"
  | "memory"
  | "cron"
  | "system"
  | "help"
  | "wms";

export interface CliCommand {
  name: string;
  aliases: string[];
  description: string;
  category: CliCommandCategory;
  usage?: string;
  examples?: string[];
  options?: Array<{
    name: string;
    alias?: string;
    description: string;
    type: "string" | "number" | "boolean";
    default?: unknown;
    required?: boolean;
  }>;
  action: (args: CliCommandArgs) => Promise<CliCommandResult> | CliCommandResult;
}

export interface CliCommandArgs {
  positional: string[];
  options: Record<string, unknown>;
  raw: string;
}

export interface CliCommandResult {
  success: boolean;
  output: string;
  data?: unknown;
  error?: string;
}

export interface CliHistoryEntry {
  id: string;
  command: string;
  timestamp: number;
  success: boolean;
  outputLength: number;
}

class CliSystem {
  private readonly commands = new Map<string, CliCommand>();
  private readonly aliases = new Map<string, string>();
  private history: CliHistoryEntry[] = [];
  private maxHistorySize = 500;

  constructor() {
    this.registerDefaultCommands();
  }

  private registerDefaultCommands(): void {
    // Help
    this.registerCommand({
      name: "help",
      aliases: ["?", "h"],
      description: "显示帮助信息",
      category: "help",
      usage: "help [command]",
      examples: ["help", "help session list"],
      action: (args) => this.cmdHelp(args),
    });

    // Version
    this.registerCommand({
      name: "version",
      aliases: ["v", "ver"],
      description: "显示版本信息",
      category: "general",
      action: () => ({
        success: true,
        output: `CDFKnow v1.0.0\nEngine: CDFKnow-core\nPlatform: ${process.platform}`,
      }),
    });

    // Clear
    this.registerCommand({
      name: "clear",
      aliases: ["cls"],
      description: "清屏",
      category: "general",
      action: () => ({ success: true, output: "__CLEAR__" }),
    });

    // History
    this.registerCommand({
      name: "history",
      aliases: ["hist"],
      description: "显示命令历史",
      category: "general",
      options: [
        { name: "limit", alias: "n", description: "显示条数", type: "number", default: 20 },
      ],
      action: (args) => this.cmdHistory(args),
    });

    // Exit
    this.registerCommand({
      name: "exit",
      aliases: ["quit", "q"],
      description: "退出 CLI",
      category: "general",
      action: () => ({ success: true, output: "再见！" }),
    });

    // Session commands
    this.registerCommand({
      name: "session",
      aliases: ["s"],
      description: "会话管理",
      category: "session",
      usage: "session <list|new|open|close|delete> [args]",
      action: (args) => this.cmdSession(args),
    });

    // Config commands
    this.registerCommand({
      name: "config",
      aliases: ["cfg"],
      description: "配置管理",
      category: "config",
      usage: "config <get|set|list|reset> [args]",
      action: (args) => this.cmdConfig(args),
    });

    // Agent commands
    this.registerCommand({
      name: "agent",
      aliases: ["ag"],
      description: "子代理管理",
      category: "agent",
      usage: "agent <list|run|status> [args]",
      action: (args) => this.cmdAgent(args),
    });

    // Cron commands
    this.registerCommand({
      name: "cron",
      aliases: ["cr"],
      description: "定时任务管理",
      category: "cron",
      usage: "cron <list|add|remove|pause|resume> [args]",
      action: (args) => this.cmdCron(args),
    });

    // Memory commands
    this.registerCommand({
      name: "memory",
      aliases: ["mem"],
      description: "记忆管理",
      category: "memory",
      usage: "memory <search|add|list|clear> [args]",
      action: (args) => this.cmdMemory(args),
    });

    // Plugin commands
    this.registerCommand({
      name: "plugin",
      aliases: ["pl"],
      description: "插件管理",
      category: "plugin",
      usage: "plugin <list|install|uninstall|enable|disable> [args]",
      action: (args) => this.cmdPlugin(args),
    });

    // System commands
    this.registerCommand({
      name: "status",
      aliases: ["st"],
      description: "系统状态",
      category: "system",
      action: () => this.cmdStatus(),
    });

    this.registerCommand({
      name: "whoami",
      aliases: [],
      description: "显示当前用户",
      category: "system",
      action: () => ({
        success: true,
        output: `当前用户: local-user\n会话ID: cli-session-${Date.now()}`,
      }),
    });

    // WMS commands
    this.registerCommand({
      name: "wms",
      aliases: ["w"],
      description: "WMS 仓库管理",
      category: "wms",
      usage: "wms <inventory|inbound|outbound|warehouse> [args]",
      action: (args) => this.cmdWms(args),
    });
  }

  // ========== Command Registration ==========

  registerCommand(command: CliCommand): void {
    this.commands.set(command.name, command);
    for (const alias of command.aliases) {
      this.aliases.set(alias, command.name);
    }
  }

  unregisterCommand(name: string): boolean {
    const cmd = this.commands.get(name);
    if (!cmd) return false;

    for (const alias of cmd.aliases) {
      this.aliases.delete(alias);
    }
    return this.commands.delete(name);
  }

  getCommand(name: string): CliCommand | undefined {
    return this.commands.get(name) || this.commands.get(this.aliases.get(name) ?? "");
  }

  listCommands(category?: CliCommandCategory): CliCommand[] {
    let commands = Array.from(this.commands.values());
    if (category) {
      commands = commands.filter((c) => c.category === category);
    }
    return commands.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ========== Command Execution ==========

  async execute(input: string): Promise<CliCommandResult> {
    const trimmed = input.trim();
    if (!trimmed) {
      return { success: true, output: "" };
    }

    // 记录历史
    const historyId = this.addToHistory(trimmed, false, 0);

    try {
      const { commandName, args } = this.parseInput(trimmed);
      const command = this.getCommand(commandName);

      if (!command) {
        const result = {
          success: false,
          output: `未知命令: ${commandName}\n输入 'help' 查看可用命令`,
          error: "Unknown command",
        };
        this.updateHistory(historyId, false, result.output.length);
        return result;
      }

      const result = await command.action(args);
      this.updateHistory(historyId, result.success, result.output.length);
      return result;
    } catch (error) {
      const output = `错误: ${error instanceof Error ? error.message : String(error)}`;
      this.updateHistory(historyId, false, output.length);
      return { success: false, output, error: String(error) };
    }
  }

  private parseInput(input: string): { commandName: string; args: CliCommandArgs } {
    const parts: string[] = [];
    let current = "";
    let inQuote = false;
    let quoteChar = "";

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if ((char === '"' || char === "'") && !inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuote) {
        inQuote = false;
        quoteChar = "";
      } else if (char === " " && !inQuote) {
        if (current) {
          parts.push(current);
          current = "";
        }
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push(current);
    }

    const commandName = parts[0]?.toLowerCase() ?? "";
    const positional = parts.slice(1).filter((p) => !p.startsWith("-"));

    const options: Record<string, unknown> = {};
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith("--")) {
        const [key, value] = part.slice(2).split("=");
        options[key] = value ?? true;
      } else if (part.startsWith("-") && part.length > 1) {
        const key = part.slice(1);
        const nextPart = parts[i + 1];
        if (nextPart && !nextPart.startsWith("-")) {
          options[key] = isNaN(Number(nextPart)) ? nextPart : Number(nextPart);
          i++;
        } else {
          options[key] = true;
        }
      }
    }

    return {
      commandName,
      args: {
        positional,
        options,
        raw: input,
      },
    };
  }

  // ========== History ==========

  private addToHistory(command: string, success: boolean, outputLength: number): string {
    const entry: CliHistoryEntry = {
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      command,
      timestamp: Date.now(),
      success,
      outputLength,
    };

    this.history.push(entry);
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }

    return entry.id;
  }

  private updateHistory(id: string, success: boolean, outputLength: number): void {
    const entry = this.history.find((h) => h.id === id);
    if (entry) {
      entry.success = success;
      entry.outputLength = outputLength;
    }
  }

  getHistory(limit = 20): CliHistoryEntry[] {
    return this.history.slice(-limit).reverse();
  }

  clearHistory(): void {
    this.history = [];
  }

  // ========== Command Implementations ==========

  private cmdHelp(args: CliCommandArgs): CliCommandResult {
    if (args.positional.length > 0) {
      const cmdName = args.positional[0];
      const cmd = this.getCommand(cmdName);
      if (!cmd) {
        return { success: false, output: `未知命令: ${cmdName}` };
      }

      let output = `\n  ${cmd.name} - ${cmd.description}\n\n`;
      if (cmd.usage) output += `  用法: ${cmd.usage}\n`;
      if (cmd.aliases.length > 0) output += `  别名: ${cmd.aliases.join(", ")}\n`;
      if (cmd.examples) {
        output += `\n  示例:\n`;
        for (const ex of cmd.examples) {
          output += `    ${ex}\n`;
        }
      }
      return { success: true, output };
    }

    const categories: CliCommandCategory[] = [
      "general",
      "session",
      "agent",
      "config",
      "cron",
      "memory",
      "plugin",
      "system",
      "wms",
      "help",
    ];

    const categoryNames: Record<CliCommandCategory, string> = {
      general: "通用命令",
      session: "会话管理",
      agent: "代理管理",
      config: "配置管理",
      cron: "定时任务",
      memory: "记忆管理",
      plugin: "插件管理",
      system: "系统命令",
      wms: "WMS 命令",
      help: "帮助",
    };

    let output = "\n  可用命令:\n\n";
    for (const cat of categories) {
      const commands = this.listCommands(cat);
      if (commands.length === 0) continue;

      output += `  ${categoryNames[cat]}:\n`;
      for (const cmd of commands) {
        const alias = cmd.aliases[0] ? ` (${cmd.aliases[0]})` : "";
        output += `    ${cmd.name.padEnd(12)}${alias.padEnd(8)}${cmd.description}\n`;
      }
      output += "\n";
    }

    output += "  输入 'help <命令>' 查看详细帮助\n";
    return { success: true, output };
  }

  private cmdHistory(args: CliCommandArgs): CliCommandResult {
    const limit = (args.options.limit as number) ?? 20;
    const history = this.getHistory(limit);

    if (history.length === 0) {
      return { success: true, output: "没有历史记录" };
    }

    let output = "";
    for (let i = 0; i < history.length; i++) {
      const entry = history[history.length - 1 - i];
      const status = entry.success ? "✓" : "✗";
      output += `  ${String(i + 1).padStart(4)}  ${status}  ${entry.command}\n`;
    }

    return { success: true, output };
  }

  private cmdSession(args: CliCommandArgs): CliCommandResult {
    const subCmd = args.positional[0] ?? "list";

    switch (subCmd) {
      case "list":
        return {
          success: true,
          output:
            "  会话列表:\n" +
            "    sess_001  WMS 入库单分析  active    2小时前\n" +
            "    sess_002  库存优化方案    active    30分钟前\n" +
            "    sess_003  供应商对账      archived  昨天\n",
        };
      case "new":
        return { success: true, output: "已创建新会话: sess_new" };
      case "open":
        return {
          success: true,
          output: `已打开会话: ${args.positional[1] ?? "sess_001"}`,
        };
      case "close":
        return {
          success: true,
          output: `已关闭会话: ${args.positional[1] ?? "current"}`,
        };
      default:
        return {
          success: false,
          output: `未知子命令: ${subCmd}\n用法: session <list|new|open|close|delete>`,
        };
    }
  }

  private cmdConfig(args: CliCommandArgs): CliCommandResult {
    const subCmd = args.positional[0] ?? "list";

    switch (subCmd) {
      case "list":
        return {
          success: true,
          output:
            "  配置项:\n" +
            "    app.language          zh-CN\n" +
            "    app.theme             system\n" +
            "    ai.defaultModel       qwen-plus\n" +
            "    memory.enabled        true\n" +
            "    wms.defaultWarehouse  wh-001\n",
        };
      case "get":
        return {
          success: true,
          output: `${args.positional[1] ?? "config.key"} = (当前值)`,
        };
      case "set":
        return {
          success: true,
          output: `已设置 ${args.positional[1] ?? "config.key"} = ${args.positional[2] ?? "value"}`,
        };
      case "reset":
        return { success: true, output: "已重置配置为默认值" };
      default:
        return {
          success: false,
          output: `未知子命令: ${subCmd}\n用法: config <get|set|list|reset>`,
        };
    }
  }

  private cmdAgent(args: CliCommandArgs): CliCommandResult {
    const subCmd = args.positional[0] ?? "list";

    switch (subCmd) {
      case "list":
        return {
          success: true,
          output:
            "  可用子代理:\n" +
            "    research-agent    研究代理    深度研究和信息收集\n" +
            "    code-agent        编码代理    代码生成和审查\n" +
            "    analyst-agent     分析代理    数据分析和报告\n" +
            "    wms-agent         WMS 操作代理 仓库管理操作\n",
        };
      case "run":
        return {
          success: true,
          output: `已启动代理: ${args.positional[1] ?? "research-agent"}`,
        };
      case "status":
        return {
          success: true,
          output: "  运行中的代理: 0 个\n  已完成: 0 个\n  失败: 0 个",
        };
      default:
        return {
          success: false,
          output: `未知子命令: ${subCmd}\n用法: agent <list|run|status>`,
        };
    }
  }

  private cmdCron(args: CliCommandArgs): CliCommandResult {
    const subCmd = args.positional[0] ?? "list";

    switch (subCmd) {
      case "list":
        return {
          success: true,
          output:
            "  定时任务:\n" +
            "    cron_001  每日库存盘点  0 0 * * *  active\n" +
            "    cron_002  每周报表生成  0 9 * * 1  active\n",
        };
      case "add":
        return {
          success: true,
          output: `已添加定时任务: ${args.positional[1] ?? "new-cron"}`,
        };
      case "remove":
        return {
          success: true,
          output: `已删除定时任务: ${args.positional[1] ?? "cron_001"}`,
        };
      default:
        return {
          success: false,
          output: `未知子命令: ${subCmd}\n用法: cron <list|add|remove|pause|resume>`,
        };
    }
  }

  private cmdMemory(args: CliCommandArgs): CliCommandResult {
    const subCmd = args.positional[0] ?? "search";

    switch (subCmd) {
      case "search":
        return {
          success: true,
          output: `搜索结果: 找到 0 条相关记忆 (关键词: ${args.positional[1] ?? "all"})`,
        };
      case "add":
        return { success: true, output: "已添加记忆条目" };
      case "list":
        return { success: true, output: "记忆条目: 0 条" };
      case "clear":
        return { success: true, output: "已清空所有记忆" };
      default:
        return {
          success: false,
          output: `未知子命令: ${subCmd}\n用法: memory <search|add|list|clear>`,
        };
    }
  }

  private cmdPlugin(args: CliCommandArgs): CliCommandResult {
    const subCmd = args.positional[0] ?? "list";

    switch (subCmd) {
      case "list":
        return {
          success: true,
          output:
            "  已安装插件:\n" +
            "    wms-inventory    库存管理插件    v1.0.0  enabled\n" +
            "    auto-reporter    自动报表插件    v0.5.0  enabled\n",
        };
      case "install":
        return {
          success: true,
          output: `正在安装插件: ${args.positional[1] ?? "plugin-name"}...\n安装完成！`,
        };
      case "uninstall":
        return {
          success: true,
          output: `已卸载插件: ${args.positional[1] ?? "plugin-name"}`,
        };
      default:
        return {
          success: false,
          output: `未知子命令: ${subCmd}\n用法: plugin <list|install|uninstall|enable|disable>`,
        };
    }
  }

  private cmdStatus(): CliCommandResult {
    const uptime = "1天 2小时 30分钟";
    return {
      success: true,
      output:
        "\n  系统状态:\n" +
        `    运行时间:   ${uptime}\n` +
        `    内存使用:   128 MB / 512 MB\n` +
        `    活跃会话:   2 个\n` +
        `    定时任务:   2 个 (active)\n` +
        `    子代理:     0 个运行中\n` +
        `    插件:       2 个已启用\n` +
        `    节点:       1 个在线\n`,
    };
  }

  private cmdWms(args: CliCommandArgs): CliCommandResult {
    const subCmd = args.positional[0] ?? "inventory";

    switch (subCmd) {
      case "inventory":
        return {
          success: true,
          output:
            "  库存概览:\n" +
            "    SKU 总数:    1,234\n" +
            "    总数量:      45,678 件\n" +
            "    总价值:      ¥1,234,567.89\n" +
            "    预警商品:    12 个\n",
        };
      case "inbound":
        return { success: true, output: "今日入库单: 5 个, 已完成: 3 个" };
      case "outbound":
        return { success: true, output: "今日出库单: 8 个, 已完成: 5 个" };
      case "warehouse":
        return {
          success: true,
          output:
            "  仓库列表:\n" +
            "    wh-001  主仓库   上海  active\n" +
            "    wh-002  备用仓库 杭州  active\n",
        };
      default:
        return {
          success: false,
          output: `未知子命令: ${subCmd}\n用法: wms <inventory|inbound|outbound|warehouse>`,
        };
    }
  }

  // ========== Stats ==========

  getStats(): {
    totalCommands: number;
    totalExecutions: number;
    successRate: number;
    historySize: number;
  } {
    const successCount = this.history.filter((h) => h.success).length;
    return {
      totalCommands: this.commands.size,
      totalExecutions: this.history.length,
      successRate: this.history.length > 0 ? successCount / this.history.length : 1,
      historySize: this.history.length,
    };
  }

  clear(): void {
    this.commands.clear();
    this.aliases.clear();
    this.history = [];
  }
}

const CLI_INSTANCE = new CliSystem();

export function getCliSystem(): CliSystem {
  return CLI_INSTANCE;
}

export async function executeCliCommand(input: string): Promise<CliCommandResult> {
  return CLI_INSTANCE.execute(input);
}

export function registerCliCommand(command: CliCommand): void {
  CLI_INSTANCE.registerCommand(command);
}

export function resetCliForTests(): void {
  CLI_INSTANCE.clear();
}

export type { CliSystem };
