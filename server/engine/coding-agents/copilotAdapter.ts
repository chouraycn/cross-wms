/**
 * GitHub Copilot 编码代理适配器
 *
 * 通过启动 GitHub Copilot CLI 子进程执行后台编码任务：
 * - 启动后台编码任务（spawn 子进程）
 * - 监控任务状态（进程运行/退出）
 * - 获取任务输出（累积 stdout/stderr）
 * - 取消任务（终止子进程）
 *
 * 参考 openclaw/extensions/copilot/index.ts 的 Copilot agent runtime 集成。
 */

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { logger } from "../../logger.js";
import type {
  CodingAgentAdapter,
  CodingAgentAdapterOptions,
  CodingAgentType,
  CodingTaskHandle,
  CodingTaskOutput,
  CodingTaskStateSnapshot,
  CodingTaskStatus,
  StartCodingTaskParams,
} from "./types.js";

/** 默认 Copilot 命令 */
const DEFAULT_COPILOT_COMMAND = "gh";
/** 默认 Copilot 子命令前缀 */
const DEFAULT_COPILOT_ARGS_PREFIX = ["copilot", "suggest"];
/** 默认超时（10 分钟） */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/** 单个任务的运行时记录 */
interface CopilotTaskRecord {
  taskId: string;
  status: CodingTaskStatus;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number;
  error?: string;
  stdout: string;
  stderr: string;
  /** 子进程句柄 */
  process: ReturnType<typeof spawn> | null;
  /** 超时定时器 */
  timeoutId?: ReturnType<typeof setTimeout>;
  /** 是否被主动取消 */
  cancelled: boolean;
}

/** 任务记录表（按 taskId 索引） */
const taskRecords = new Map<string, CopilotTaskRecord>();

/**
 * 构建 Copilot CLI 参数。
 *
 * 默认调用 `gh copilot suggest`，可通过 options.command / options 覆盖。
 */
function buildArgs(
  prompt: string,
  model: string | undefined,
  extraArgs: string[] | undefined,
  argsPrefix: string[],
): string[] {
  const args = [...argsPrefix];
  if (model) {
    args.push("--model", model);
  }
  args.push(prompt);
  if (extraArgs && extraArgs.length > 0) {
    args.push(...extraArgs);
  }
  return args;
}

/** 探测命令是否可用 */
function isCommandAvailable(command: string): boolean {
  try {
    const result = spawnSync(command, ["--version"], { stdio: "ignore", shell: true });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function createCopilotAdapter(
  options: CodingAgentAdapterOptions = {},
): CodingAgentAdapter {
  const {
    command = DEFAULT_COPILOT_COMMAND,
    defaultModel,
    defaultCwd,
    defaultTimeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const argsPrefix = DEFAULT_COPILOT_ARGS_PREFIX;

  return {
    agentType: "copilot" as CodingAgentType,
    label: "GitHub Copilot",

    isConfigured(): boolean {
      return isCommandAvailable(command);
    },

    async startTask(params: StartCodingTaskParams): Promise<CodingTaskHandle> {
      const taskId = `copilot-${randomUUID()}`;
      const startedAt = Date.now();
      const cwd = params.cwd ?? defaultCwd ?? process.cwd();
      const model = params.model ?? defaultModel;
      const timeoutMs = params.timeoutMs ?? defaultTimeoutMs;

      const args = buildArgs(params.prompt, model, params.extraArgs, argsPrefix);
      const env = { ...process.env, ...(params.env ?? {}) };

      logger.debug(`[copilot] starting task ${taskId}: ${command} ${args.join(" ")}`);

      const child = spawn(command, args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      });

      const record: CopilotTaskRecord = {
        taskId,
        status: "running",
        startedAt,
        stdout: "",
        stderr: "",
        process: child,
        cancelled: false,
      };
      taskRecords.set(taskId, record);

      child.stdout?.on("data", (chunk: Buffer) => {
        record.stdout += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        record.stderr += chunk.toString("utf8");
      });

      // 超时处理
      if (timeoutMs > 0) {
        record.timeoutId = setTimeout(() => {
          if (record.status === "running") {
            logger.warn(`[copilot] task ${taskId} timed out after ${timeoutMs}ms`);
            record.cancelled = true;
            try {
              child.kill("SIGTERM");
            } catch {
              // 进程可能已退出
            }
          }
        }, timeoutMs);
      }

      child.on("error", (err: Error) => {
        record.status = "failed";
        record.finishedAt = Date.now();
        record.error = err.message;
        if (record.timeoutId) clearTimeout(record.timeoutId);
        logger.error(`[copilot] task ${taskId} error: ${err.message}`);
      });

      child.on("close", (code: number | null) => {
        if (record.timeoutId) clearTimeout(record.timeoutId);
        record.exitCode = code ?? undefined;
        record.finishedAt = Date.now();
        record.process = null;
        if (record.cancelled) {
          record.status = "cancelled";
        } else if (code === 0) {
          record.status = "completed";
        } else {
          record.status = "failed";
          if (!record.error) {
            record.error = `Copilot process exited with code ${code}`;
          }
        }
        logger.debug(
          `[copilot] task ${taskId} finished: status=${record.status}, exitCode=${code}`,
        );
      });

      return {
        taskId,
        agent: "copilot",
        startedAt,
        pid: child.pid,
      };
    },

    async getStatus(taskId: string): Promise<CodingTaskStateSnapshot | undefined> {
      const record = taskRecords.get(taskId);
      if (!record) return undefined;
      return {
        taskId: record.taskId,
        agent: "copilot",
        status: record.status,
        startedAt: record.startedAt,
        finishedAt: record.finishedAt,
        exitCode: record.exitCode,
        error: record.error,
      };
    },

    async getOutput(taskId: string): Promise<CodingTaskOutput | undefined> {
      const record = taskRecords.get(taskId);
      if (!record) return undefined;
      return {
        taskId: record.taskId,
        stdout: record.stdout,
        stderr: record.stderr,
        status: record.status,
      };
    },

    async cancelTask(taskId: string): Promise<boolean> {
      const record = taskRecords.get(taskId);
      if (!record) return false;
      if (record.status !== "running") return false;
      record.cancelled = true;
      if (record.timeoutId) clearTimeout(record.timeoutId);
      if (record.process) {
        try {
          record.process.kill("SIGTERM");
          // 给进程 3 秒优雅退出，随后强制终止
          setTimeout(() => {
            if (record.process && record.status === "running") {
              try {
                record.process.kill("SIGKILL");
              } catch {
                // 已退出
              }
            }
          }, 3000);
          return true;
        } catch {
          return false;
        }
      }
      // 无进程可终止，直接标记取消
      record.status = "cancelled";
      record.finishedAt = Date.now();
      return true;
    },
  };
}

/** 默认 Copilot 适配器实例 */
export const copilotAdapter = createCopilotAdapter();

export default copilotAdapter;
