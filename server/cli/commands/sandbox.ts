/**
 * sandbox 命令
 * 沙箱管理 (create/list/info/destroy/exec)
 *
 * 参考 openclaw sandbox-cli，封装对 server/engine/sandbox 模块的调用。
 * 当沙箱系统尚未就绪时，使用本地状态进行模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type SandboxOptions = {
  json?: boolean;
};

/** 沙箱状态 */
type SandboxState = "running" | "stopped" | "creating" | "error";

/** 沙箱实例信息 */
interface SandboxInstance {
  id: string;
  name: string;
  state: SandboxState;
  runtime: string;
  createdAt: string;
  memoryMb: number;
  cpuCores: number;
}

/** 模拟沙箱实例存储 */
const sandboxes = new Map<string, SandboxInstance>();

/** 生成沙箱 ID */
function generateSandboxId(): string {
  return `sbx_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
}

/** 创建沙箱 */
function createSandbox(name: string, options: { runtime?: string; memory?: number }): SandboxInstance {
  const id = generateSandboxId();
  const sandbox: SandboxInstance = {
    id,
    name: name || `sandbox-${id.slice(-6)}`,
    state: "running",
    runtime: options.runtime || "docker",
    createdAt: new Date().toISOString(),
    memoryMb: options.memory || 512,
    cpuCores: 1,
  };
  sandboxes.set(id, sandbox);
  return sandbox;
}

/** 列出沙箱 */
function listSandboxes(): SandboxInstance[] {
  return Array.from(sandboxes.values());
}

/** 获取沙箱信息 */
function getSandboxInfo(id: string): SandboxInstance | undefined {
  return sandboxes.get(id);
}

/** 销毁沙箱 */
function destroySandbox(id: string): boolean {
  return sandboxes.delete(id);
}

/** 在沙箱中执行命令 */
function execInSandbox(id: string, command: string): { exitCode: number; stdout: string; stderr: string } {
  const sandbox = sandboxes.get(id);
  if (!sandbox) {
    throw new Error(`Sandbox not found: ${id}`);
  }
  if (sandbox.state !== "running") {
    throw new Error(`Sandbox is not running: ${id} (state: ${sandbox.state})`);
  }
  return {
    exitCode: 0,
    stdout: `[${sandbox.name}] $ ${command}\n(simulated output)`,
    stderr: "",
  };
}

/** 格式化 JSON 输出 */
function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** 格式化沙箱列表输出 */
function formatSandboxList(sandboxesList: SandboxInstance[]): string {
  if (sandboxesList.length === 0) {
    return "\n  没有运行中的沙箱实例\n";
  }
  const lines: string[] = [""];
  lines.push("  沙箱实例列表:");
  for (const sbx of sandboxesList) {
    lines.push(`    ${sbx.id}  ${sbx.name}  [${sbx.state}]  ${sbx.runtime}  ${sbx.memoryMb}MB`);
  }
  lines.push("");
  return lines.join("\n");
}

/** 格式化沙箱详情输出 */
function formatSandboxInfo(sbx: SandboxInstance): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("  沙箱实例详情:");
  lines.push(`    ID:       ${sbx.id}`);
  lines.push(`    名称:     ${sbx.name}`);
  lines.push(`    状态:     ${sbx.state}`);
  lines.push(`    运行时:   ${sbx.runtime}`);
  lines.push(`    内存:     ${sbx.memoryMb} MB`);
  lines.push(`    CPU:      ${sbx.cpuCores} 核`);
  lines.push(`    创建时间: ${new Date(sbx.createdAt).toLocaleString("zh-CN")}`);
  lines.push("");
  return lines.join("\n");
}

/**
 * 注册 sandbox 命令
 */
export function registerSandboxCommand(program: Command): void {
  const sandboxCmd = program
    .command("sandbox")
    .description("沙箱管理 (create/list/info/destroy/exec)")
    .alias("sbx");

  sandboxCmd
    .command("create")
    .description("创建沙箱实例")
    .argument("[name]", "沙箱名称")
    .option("--runtime <runtime>", "运行时类型 (docker/gvisor/wasm)", "docker")
    .option("--memory <mb>", "内存限制 (MB)", "512")
    .option("--json", "JSON 输出格式")
    .action((name: string | undefined, options: SandboxOptions & { runtime?: string; memory?: string }) => {
      const sandbox = createSandbox(name || "", {
        runtime: options.runtime,
        memory: options.memory ? parseInt(options.memory, 10) : undefined,
      });
      logger.info(`[Sandbox] 已创建沙箱: ${sandbox.id}`);
      if (options.json) {
        console.log(formatJsonOutput(sandbox));
      } else {
        console.log(formatSandboxInfo(sandbox));
      }
    });

  sandboxCmd
    .command("list")
    .description("列出所有沙箱实例")
    .option("--json", "JSON 输出格式")
    .action((options: SandboxOptions) => {
      const list = listSandboxes();
      if (options.json) {
        console.log(formatJsonOutput(list));
      } else {
        console.log(formatSandboxList(list));
      }
    });

  sandboxCmd
    .command("info")
    .description("显示沙箱实例详情")
    .argument("<id>", "沙箱 ID")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: SandboxOptions) => {
      const sandbox = getSandboxInfo(id);
      if (!sandbox) {
        logger.error(`[Sandbox] 未找到沙箱: ${id}`);
        process.exit(1);
      }
      if (options.json) {
        console.log(formatJsonOutput(sandbox));
      } else {
        console.log(formatSandboxInfo(sandbox));
      }
    });

  sandboxCmd
    .command("destroy")
    .description("销毁沙箱实例")
    .argument("<id>", "沙箱 ID")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: SandboxOptions) => {
      const destroyed = destroySandbox(id);
      if (!destroyed) {
        logger.error(`[Sandbox] 未找到沙箱: ${id}`);
        process.exit(1);
      }
      logger.info(`[Sandbox] 已销毁沙箱: ${id}`);
      if (options.json) {
        console.log(formatJsonOutput({ id, destroyed: true }));
      }
    });

  sandboxCmd
    .command("exec")
    .description("在沙箱中执行命令")
    .argument("<id>", "沙箱 ID")
    .argument("<command>", "要执行的命令")
    .option("--json", "JSON 输出格式")
    .action((id: string, command: string, options: SandboxOptions) => {
      try {
        const result = execInSandbox(id, command);
        if (options.json) {
          console.log(formatJsonOutput(result));
        } else {
          console.log(result.stdout);
          if (result.stderr) {
            console.error(result.stderr);
          }
        }
      } catch (err) {
        logger.error(`[Sandbox] ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
