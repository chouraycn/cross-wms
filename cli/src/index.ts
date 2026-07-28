#!/usr/bin/env node

import { Command } from 'commander';
import { pluginCommand } from './commands/plugin.js';
import { agentCommand } from './commands/agent.js';
import { configCommand } from './commands/config.js';
import { extensionCommand } from './commands/extension.js';
import { versionCommand } from './commands/version.js';
import { statusCommand } from './commands/status.js';
import { doctorCommand } from './commands/doctor.js';
import { cronCommand } from './commands/cron.js';
import { daemonCommand } from './commands/daemon.js';
import { gatewayCommand } from './commands/gateway.js';
import { modelsCommand } from './commands/models.js';
import { nodesCommand } from './commands/nodes.js';
import { skillsCommand } from './commands/skills.js';
import { tuiCommand } from './commands/tui.js';
import { clawbotCommand } from './commands/clawbot.js';
import { channelsCommand } from './commands/channels.js';
import { acpCommand } from './commands/acp.js';
import { capabilityCommand } from './commands/capability.js';
import { updateCommand } from './commands/update.js';
import { backupCommand } from './commands/backup.js';

const program = new Command();

program
  .name('crosswms')
  .description('CLI tools for cdf-know')
  .version('1.0.0');

program.addCommand(pluginCommand);
program.addCommand(agentCommand);
program.addCommand(configCommand);
program.addCommand(extensionCommand);
program.addCommand(versionCommand);
program.addCommand(statusCommand);
program.addCommand(doctorCommand);
program.addCommand(cronCommand);
program.addCommand(daemonCommand);
program.addCommand(gatewayCommand);
program.addCommand(modelsCommand);
program.addCommand(nodesCommand);
program.addCommand(skillsCommand);
program.addCommand(tuiCommand);
program.addCommand(clawbotCommand);
program.addCommand(channelsCommand);
program.addCommand(acpCommand);
program.addCommand(capabilityCommand);
program.addCommand(updateCommand);
program.addCommand(backupCommand);

/**
 * 命令分类与简短描述（用于顶层 help 文本）。
 *
 * 分类：
 *  - 基础：通用信息查询
 *  - 诊断：健康检查与排障
 *  - 调度：定时任务与守护进程
 *  - 网络：网关、节点探测
 *  - 技能：技能、模型、Agent、插件、扩展
 */
const commandCategories: Array<{ category: string; commands: Array<{ name: string; desc: string }> }> = [
  {
    category: '基础 (Base)',
    commands: [
      { name: 'version', desc: '显示 CLI 与服务端版本信息' },
      { name: 'status', desc: '查看系统运行状态' },
      { name: 'config', desc: '查看 / 修改本地配置' },
    ],
  },
  {
    category: '诊断 (Diagnostics)',
    commands: [
      { name: 'doctor', desc: '运行系统健康检查（Node / 配置 / 插件 / 磁盘 / TypeScript）' },
    ],
  },
  {
    category: '调度 (Scheduling)',
    commands: [
      { name: 'cron', desc: '管理定时任务（list / run / logs）' },
      { name: 'daemon', desc: '守护进程控制（start / stop / status / logs）' },
    ],
  },
  {
    category: '网络 (Network)',
    commands: [
      { name: 'gateway', desc: '网关状态、探测与网络统计' },
      { name: 'nodes', desc: '分布式节点管理（list / status）' },
      { name: 'channels', desc: '通道管理（list / install / enable / disable）' },
    ],
  },
  {
    category: '技能 (Skills)',
    commands: [
      { name: 'skills', desc: '技能市场与管理' },
      { name: 'models', desc: '模型列表与配置' },
      { name: 'agent', desc: 'Agent 会话与执行' },
      { name: 'plugin', desc: '插件注册与管理' },
      { name: 'extension', desc: '扩展加载与发现' },
      { name: 'tui', desc: '进入交互式终端 UI' },
      { name: 'clawbot', desc: 'AI 对话入口（chat / history / list / clear）' },
      { name: 'acp', desc: 'ACP 子代理管理（spawn / list / kill）' },
      { name: 'capability', desc: '能力声明管理（list / inspect / enable / disable）' },
    ],
  },
  {
    category: '运维 (Operations)',
    commands: [
      { name: 'update', desc: 'CLI 自更新（check / download / install）' },
      { name: 'backup', desc: '数据备份与恢复（create / restore / verify）' },
    ],
  },
];

const helpBody = (context: { error: boolean; command: Command }): string => {
  // 仅在根命令上展示分类；子命令（如 crosswms doctor --help）保持原样。
  if (context.command.parent !== null) return '';
  const lines: string[] = [];
  lines.push('');
  lines.push('命令分类 (Command categories):');
  for (const group of commandCategories) {
    lines.push(`  ${group.category}`);
    for (const cmd of group.commands) {
      lines.push(`    ${cmd.name.padEnd(12)} ${cmd.desc}`);
    }
  }
  lines.push('');
  lines.push('常用示例 (Examples):');
  lines.push('  $ crosswms doctor --json                 # 以 JSON 输出健康检查报告');
  lines.push('  $ crosswms doctor --verbose              # 显示每个检查的详细输出');
  lines.push('  $ crosswms doctor --no-color             # 禁用颜色（适合 CI / 管道）');
  lines.push('  $ crosswms status                        # 查看系统状态');
  lines.push('  $ crosswms cron list                     # 列出所有定时任务');
  lines.push('  $ crosswms cron run cleanup-logs         # 手动触发指定任务');
  lines.push('  $ crosswms daemon start                  # 启动守护进程');
  lines.push('  $ crosswms models list                   # 查看可用模型');
  lines.push('  $ crosswms skills list                   # 查看已注册技能');
  lines.push('  $ crosswms tui                           # 进入交互式 TUI');
  lines.push('');
  lines.push('提示：每个子命令都支持 --help，例如 `crosswms doctor --help`。');
  return lines.join('\n');
};

program.addHelpText('after', helpBody);

program.parse();
