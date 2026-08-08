/**
 * onboard 命令
 * 入门引导 (start/tour/finish)
 *
 * 参考 openclaw onboard-cli，提供新用户入门引导。
 * 使用模拟实现，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type OnboardOptions = {
  json?: boolean;
};

interface OnboardStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
}

function getOnboardSteps(): OnboardStep[] {
  return [
    { id: "welcome", title: "欢迎", description: "了解 cross-wms 的基本概念", completed: false },
    { id: "first-chat", title: "首次对话", description: "与代理进行第一次对话", completed: false },
    { id: "create-memory", title: "创建记忆", description: "添加一条记忆条目", completed: false },
    { id: "explore-wiki", title: "浏览知识库", description: "查看 Wiki 文档", completed: false },
    { id: "setup-cron", title: "设置定时任务", description: "创建一个定时任务", completed: false },
    { id: "next-steps", title: "后续步骤", description: "了解进阶功能与文档", completed: false },
  ];
}

function markStepCompleted(steps: OnboardStep[], id: string): boolean {
  const step = steps.find((s) => s.id === id);
  if (!step) {
    return false;
  }
  step.completed = true;
  return true;
}

function getProgress(steps: OnboardStep[]): { total: number; completed: number; percentage: number } {
  const total = steps.length;
  const completed = steps.filter((s) => s.completed).length;
  return { total, completed, percentage: Math.round((completed / total) * 100) };
}

function formatJsonOutput(data: any): string {
  return JSON.stringify(data, null, 2);
}

export function registerOnboardCommand(program: Command): void {
  const onboardCmd = program
    .command("onboard")
    .description("入门引导 (start/tour/status)");

  onboardCmd
    .command("start")
    .description("开始入门引导")
    .option("--json", "JSON 输出格式")
    .action((options: OnboardOptions) => {
      const steps = getOnboardSteps();
      if (options.json) {
        logger.info(formatJsonOutput(steps));
      } else {
        logger.info("欢迎来到 cross-wms 入门引导！");
        logger.info("请按顺序完成以下步骤:\n");
        for (let i = 0; i < steps.length; i++) {
          logger.info(`  ${i + 1}. ${steps[i].title}: ${steps[i].description}`);
        }
      }
    });

  onboardCmd
    .command("tour <stepId>")
    .description("查看指定步骤的引导详情")
    .action((stepId: string) => {
      const steps = getOnboardSteps();
      const step = steps.find((s) => s.id === stepId);
      if (!step) {
        logger.error(`未找到引导步骤: ${stepId}`);
        return;
      }
      logger.info(`\n  ${step.title}`);
      logger.info(`  ${step.description}`);
      logger.info(`  运行 'cdfknow onboard complete ${step.id}' 标记为已完成\n`);
    });

  onboardCmd
    .command("complete <stepId>")
    .description("标记引导步骤为已完成")
    .option("--json", "JSON 输出格式")
    .action((stepId: string, options: OnboardOptions) => {
      const steps = getOnboardSteps();
      const ok = markStepCompleted(steps, stepId);
      if (!ok) {
        logger.error(`未找到引导步骤: ${stepId}`);
        return;
      }
      const progress = getProgress(steps);
      if (options.json) {
        logger.info(formatJsonOutput({ stepId, completed: true, progress }));
      } else {
        logger.info(`已完成: ${stepId} (${progress.completed}/${progress.total})`);
      }
    });

  onboardCmd
    .command("status")
    .description("查看引导进度")
    .option("--json", "JSON 输出格式")
    .action((options: OnboardOptions) => {
      const steps = getOnboardSteps();
      const progress = getProgress(steps);
      if (options.json) {
        logger.info(formatJsonOutput({ progress, steps }));
      } else {
        logger.info(`引导进度: ${progress.completed}/${progress.total} (${progress.percentage}%)`);
        for (const step of steps) {
          logger.info(`  ${step.completed ? "✓" : "○"} ${step.id}: ${step.title}`);
        }
      }
    });

  // 默认 start
  onboardCmd
    .option("--json", "JSON 输出格式")
    .action((options: OnboardOptions) => {
      const steps = getOnboardSteps();
      if (options.json) {
        logger.info(formatJsonOutput(steps));
      } else {
        logger.info("入门引导步骤:");
        for (const step of steps) {
          logger.info(`  ○ ${step.id}: ${step.title}`);
        }
      }
    });
}
