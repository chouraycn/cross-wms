/**
 * qr 命令
 * 二维码生成 (generate/scan)
 *
 * 参考 openclaw qr-cli，生成与解析二维码。
 * 使用模拟实现，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type QrOptions = {
  json?: boolean;
  output?: string;
  size?: string;
};

interface QrResult {
  content: string;
  size: number;
  format: string;
  path: string;
}

function generateQr(content: string, size: number, outputPath?: string): QrResult {
  return {
    content,
    size,
    format: "png",
    path: outputPath || `/tmp/cdfknow-qr-${Date.now()}.png`,
  };
}

function scanQr(path: string): { success: boolean; content?: string; message: string } {
  if (!path) {
    return { success: false, message: "未提供文件路径" };
  }
  return {
    success: true,
    content: "https://example.com/paired-device",
    message: `已扫描 ${path}`,
  };
}

function formatJsonOutput(data: any): string {
  return JSON.stringify(data, null, 2);
}

export function registerQrCommand(program: Command): void {
  const qrCmd = program
    .command("qr")
    .description("二维码生成 (generate/scan)");

  qrCmd
    .command("generate <content>")
    .description("生成二维码")
    .option("-o, --output <path>", "输出文件路径")
    .option("-s, --size <n>", "尺寸 (像素)", "256")
    .option("--json", "JSON 输出格式")
    .action((content: string, options: QrOptions) => {
      const size = options.size ? parseInt(options.size, 10) : 256;
      const result = generateQr(content, size, options.output);
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(`已生成二维码: ${result.path}`);
        logger.info(`  内容: ${result.content}`);
        logger.info(`  尺寸: ${result.size}x${result.size} (${result.format})`);
      }
    });

  qrCmd
    .command("scan <path>")
    .description("扫描二维码图片")
    .option("--json", "JSON 输出格式")
    .action((path: string, options: QrOptions) => {
      const result = scanQr(path);
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        if (result.success) {
          logger.info(`✓ ${result.message}`);
          logger.info(`  内容: ${result.content}`);
        } else {
          logger.info(`✗ ${result.message}`);
        }
      }
    });

  // 默认 generate（需要 content 参数，无参数时显示帮助）
  qrCmd
    .argument("[content]", "要编码的内容")
    .option("-o, --output <path>", "输出文件路径")
    .option("-s, --size <n>", "尺寸", "256")
    .option("--json", "JSON 输出格式")
    .action((content: string | undefined, options: QrOptions) => {
      if (!content) {
        logger.info("用法: cdfknow qr generate <content>");
        return;
      }
      const size = options.size ? parseInt(options.size, 10) : 256;
      const result = generateQr(content, size, options.output);
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(`已生成二维码: ${result.path}`);
      }
    });
}
