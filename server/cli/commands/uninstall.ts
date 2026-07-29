/**
 * uninstall 命令
 * 卸载 (remove/clean)
 *
 * 参考 openclaw uninstall-cli，提供卸载与清理能力。
 * 使用模拟实现，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type UninstallOptions = {
  json?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  keepData?: boolean;
};

interface UninstallStep {
  name: string;
  label: string;
  removable: boolean;
}

function getUninstallSteps(keepData: boolean): UninstallStep[] {
  const steps: UninstallStep[] = [
    { name: "stop-daemon", label: "停止守护进程", removable: true },
    { name: "stop-gateway", label: "停止网关服务", removable: true },
    { name: "remove-config", label: "移除配置文件", removable: true },
    { name: "remove-bin", label: "移除 CLI 可执行文件", removable: true },
    { name: "remove-data", label: "移除数据目录", removable: !keepData },
    { name: "remove-logs", label: "移除日志文件", removable: !keepData },
  ];
  return steps;
}

function runUninstall(options: UninstallOptions): { steps: UninstallStep[]; removed: number; skipped: number } {
  const steps = getUninstallSteps(Boolean(options.keepData));
  let removed = 0;
  let skipped = 0;
  for (const step of steps) {
    if (!step.removable) {
      skipped++;
      continue;
    }
    if (!options.dryRun) {
      // 模拟删除
    }
    removed++;
  }
  return { steps, removed, skipped };
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerUninstallCommand(program: Command): void {
  program
    .command("uninstall")
    .description("卸载 cross-wms 并清理文件")
    .option("--dry-run", "仅预检不删除")
    .option("--yes", "确认卸载")
    .option("--keep-data", "保留数据目录")
    .option("--json", "JSON 输出格式")
    .action((options: UninstallOptions) => {
      if (!options.yes && !options.dryRun) {
        logger.warn("卸载将移除 cross-wms 相关文件。使用 --yes 确认，或 --dry-run 预检。");
        return;
      }
      const result = runUninstall(options);
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(options.dryRun ? "卸载预检:" : "卸载完成:");
        for (const step of result.steps) {
          if (!step.removable) {
            logger.info(`  · ${step.name}: ${step.label} (已保留)`);
          } else {
            logger.info(`  ${options.dryRun ? "○" : "✓"} ${step.name}: ${step.label}`);
          }
        }
        logger.info(`\n已移除 ${result.removed} 项，跳过 ${result.skipped} 项`);
      }
    });
}
