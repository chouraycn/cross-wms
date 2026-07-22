/**
 * 移植自 openclaw/src/agents/sessions/tools/bash.ts
 *
 * Cross-wms 实现：
 *  - 命令解析与校验（allowlist/denylist、危险模式检测）
 *  - 超时控制（与沙箱策略取较小值）
 *  - 输出流式回调（stdout/stderr 分发）
 *  - 退出码归一化（127 not-found / 126 not-executable / signal kill 等）
 *  - 环境变量隔离（复用 docker.ts 的 sanitizeEnvVars / sanitizeExplicitSandboxEnvVars）
 *
 * 实际进程 spawn 委托给 ./../bashExecutor.js 的 executeCommand，避免与既有进程
 * 会话注册表（processSessions）逻辑重复。
 */

import { EventEmitter } from "node:events";
import type { ExecResult, ExecToolParams } from "../bashSchemas.js";
import { evaluateSandboxPolicy } from "../sandboxPolicy.js";
import { executeCommand } from "../bashExecutor.js";
import {
  sanitizeEnvVars,
  sanitizeExplicitSandboxEnvVars,
  type EnvSanitizationOptions,
} from "./docker.js";

// ============================================================================
// 类型定义
// ============================================================================

/** Spawn hook：在子进程 spawn 后、退出前被调用，可注入 stdin/kill 等控制。 */
export interface BashSpawnHook {
  /** 进程已启动。返回 false 可立即终止进程。 */
  onSpawn?: (ctx: BashSpawnContext) => void | Promise<void>;
  /** 进程退出。 */
  onExit?: (ctx: BashSpawnContext, result: ExecResult) => void | Promise<void>;
  /** 进程错误。 */
  onError?: (ctx: BashSpawnContext, error: Error) => void | Promise<void>;
}

/** Spawn 上下文：暴露给 hook 的运行时句柄。 */
export interface BashSpawnContext {
  /** 会话 ID（后台进程使用）。 */
  sessionId: string;
  /** 命令字符串。 */
  command: string;
  /** 工作目录。 */
  cwd: string;
  /** 子进程 PID（启动后可用）。 */
  pid?: number;
  /** 是否后台运行。 */
  backgrounded: boolean;
  /** 输出事件发射器（'output' / 'exit' / 'error' 事件）。 */
  events: EventEmitter;
}

/** Bash 工具选项。 */
export interface BashToolOptions {
  /** 默认 shell 超时（毫秒）。0 表示无超时。 */
  defaultTimeoutMs?: number;
  /** 最大允许超时（毫秒）。 */
  maxTimeoutMs?: number;
  /** 默认工作目录。 */
  cwd?: string;
  /** 默认最大输出字符数。 */
  maxOutputChars?: number;
  /** 默认后台 yield 毫秒。 */
  yieldMs?: number;
  /** 命令 allowlist（命令名匹配，首字 positional）。 */
  allowedCommands?: string[];
  /** 命令 denylist。 */
  blockedCommands?: string[];
  /** 环境变量净化选项。 */
  envSanitization?: EnvSanitizationOptions;
  /** Spawn hook 链。 */
  spawnHooks?: BashSpawnHook[];
  /** 自定义环境变量（与 process.env 合并前已净化）。 */
  env?: Record<string, string>;
}

// ============================================================================
// 常量
// ============================================================================

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 3_600_000; // 1 小时

/**
 * 危险命令模式（前缀/包含匹配）。匹配则拒绝执行。
 * 注意：这并非完整 shell 解析；只对裸命令行做粗粒度拦截。
 */
const DANGEROUS_COMMAND_PATTERNS: ReadonlyArray<RegExp> = [
  /\brm\s+-rf\s+\/(?:\s|$)/, // rm -rf /
  /\bmkfs(\.|\s)/, // mkfs
  /\bdd\s+if=\/dev\/(?:zero|random|urandom)\s+of=\/dev\/(?:sd|nvme|hd)/, // dd 覆写磁盘
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;:/, // fork bomb
  /\bsh\s+-c\s+['"]\s*:\(\)\s*\{/, // fork bomb via sh
];

// ============================================================================
// 工具实现
// ============================================================================

/**
 * 解析 Bash 超时（毫秒）。
 *
 * 优先级：opts.maxTimeoutMs > params.timeout（秒） > opts.defaultTimeoutMs > DEFAULT_TIMEOUT_MS。
 * 始终返回 [0, maxTimeoutMs] 范围内的整数；0 表示禁用超时。
 */
export function resolveBashTimeoutMs(
  params: { timeout?: number } | undefined,
  opts: Pick<BashToolOptions, "defaultTimeoutMs" | "maxTimeoutMs"> = {},
): number {
  const maxTimeoutMs =
    opts.maxTimeoutMs && opts.maxTimeoutMs > 0 ? opts.maxTimeoutMs : MAX_TIMEOUT_MS;

  const fromParams =
    typeof params?.timeout === "number" && params.timeout > 0
      ? Math.floor(params.timeout * 1000)
      : undefined;

  const fromOpts =
    opts.defaultTimeoutMs && opts.defaultTimeoutMs > 0 ? opts.defaultTimeoutMs : undefined;

  const candidate = fromParams ?? fromOpts ?? DEFAULT_TIMEOUT_MS;
  if (candidate <= 0) {
    return 0;
  }
  return Math.min(candidate, maxTimeoutMs);
}

/**
 * 提取命令首字 positional（粗略 binary 名）。
 * 仅作为 allowlist/denylist 匹配的辅助，不依赖完整 shell 解析。
 */
function extractBinaryName(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed) {
    return null;
  }
  // 跳过前导 env 变量赋值（FOO=bar cmd ...）
  let rest = trimmed;
  const envAssignment = /^([A-Z_][A-Z0-9_]*=\S+\s+)+/i.exec(rest);
  if (envAssignment) {
    rest = rest.slice(envAssignment[0].length);
  }
  // 跳过 sudo / env / nohup 等 wrapper
  const wrapperMatch = /^(?:sudo|env|nohup|exec|command)\s+/.exec(rest);
  if (wrapperMatch) {
    rest = rest.slice(wrapperMatch[0].length);
  }
  // 取第一个 token
  const match = /^([^\s'"\\]+)/.exec(rest);
  if (!match) {
    return null;
  }
  const binary = match[1] ?? "";
  // 取 basename
  const slash = binary.lastIndexOf("/");
  return slash >= 0 ? binary.slice(slash + 1) : binary;
}

/**
 * 校验命令是否允许执行。
 * 顺序：危险模式 → denylist → allowlist（若配置）。
 */
export function validateCommand(
  command: string,
  opts: Pick<BashToolOptions, "allowedCommands" | "blockedCommands"> = {},
): { allowed: boolean; reason?: string } {
  if (!command || !command.trim()) {
    return { allowed: false, reason: "Command is empty" };
  }

  // 1) 危险模式
  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      return {
        allowed: false,
        reason: `Command matches dangerous pattern: ${pattern.source}`,
      };
    }
  }

  const binary = extractBinaryName(command);
  if (!binary) {
    // 无法解析 binary 名时，仅在显式 allowlist 模式下拒绝
    if (opts.allowedCommands && opts.allowedCommands.length > 0) {
      return { allowed: false, reason: "Cannot determine command binary under allowlist mode" };
    }
    return { allowed: true };
  }

  // 2) denylist
  if (opts.blockedCommands?.includes(binary)) {
    return { allowed: false, reason: `Command "${binary}" is blocked` };
  }

  // 3) allowlist（仅当配置时启用）
  if (opts.allowedCommands && opts.allowedCommands.length > 0) {
    if (!opts.allowedCommands.includes(binary)) {
      return {
        allowed: false,
        reason: `Command "${binary}" is not in allowlist`,
      };
    }
  }

  return { allowed: true };
}

/**
 * 净化环境变量：合并 process.env 与显式 env，剥离密钥与可疑值。
 */
export function buildSandboxEnv(
  explicitEnv: Record<string, string> | undefined,
  options: EnvSanitizationOptions & { inheritProcessEnv?: boolean } = {},
): Record<string, string> {
  const inherit = options.inheritProcessEnv !== false;
  const inherited = inherit
    ? sanitizeEnvVars(process.env as Record<string, string | undefined>, options).allowed
    : {};
  const explicit = sanitizeExplicitSandboxEnvVars(
    (explicitEnv ?? {}) as Record<string, string | undefined>,
  ).allowed;
  return { ...inherited, ...explicit };
}

/**
 * 创建本地 Bash 操作集。封装命令校验、超时解析、env 净化。
 *
 * 该工厂返回一组纯函数，便于在 sandbox / host 等不同后端复用。
 */
export function createLocalBashOperations(opts: BashToolOptions = {}) {
  return {
    /** 解析超时（毫秒）。 */
    resolveTimeoutMs(params: { timeout?: number } = {}): number {
      return resolveBashTimeoutMs(params, opts);
    },

    /** 校验命令。 */
    validateCommand(command: string) {
      return validateCommand(command, opts);
    },

    /** 净化 env。 */
    buildEnv(explicitEnv?: Record<string, string>) {
      return buildSandboxEnv(explicitEnv, opts.envSanitization ?? {});
    },

    /** 默认 cwd。 */
    resolveCwd(workdir?: string): string {
      return workdir ?? opts.cwd ?? process.cwd();
    },

    /** 默认 maxOutputChars。 */
    resolveMaxOutputChars(maxOutputChars?: number): number {
      return maxOutputChars ?? opts.maxOutputChars ?? 200_000;
    },
  };
}

/**
 * 创建 Bash 工具定义（描述 + schema 引用）。
 * 与具体的 tool runtime 解耦，仅提供元数据。
 */
export function createBashToolDefinition(opts: BashToolOptions = {}) {
  return {
    name: "bash",
    description:
      "Execute a bash command locally. Supports timeout, background mode, env isolation.",
    defaultTimeoutMs: opts.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxTimeoutMs: opts.maxTimeoutMs ?? MAX_TIMEOUT_MS,
    allowedCommands: opts.allowedCommands,
    blockedCommands: opts.blockedCommands,
  };
}

/**
 * 创建一个完整的 Bash 工具实例。
 *
 * 调用 `tool.run(params)` 时：
 *  1. 校验命令（危险模式 / denylist / allowlist）
 *  2. 评估沙箱策略（来自 ../sandboxPolicy.js）
 *  3. 净化环境变量
 *  4. 委托给 ../bashExecutor.js 的 executeCommand 执行
 *  5. 在 spawn/exit/error 阶段触发注册的 hook
 *
 * 失败时返回 status='failed' 的 ExecResult，不抛错（除非校验阶段抛错）。
 */
export function createBashTool(opts: BashToolOptions = {}) {
  const operations = createLocalBashOperations(opts);
  const definition = createBashToolDefinition(opts);
  const hooks = opts.spawnHooks ?? [];

  return {
    name: definition.name,
    definition,

    /**
     * 执行命令。
     *
     * @param params ExecToolParams（来自 ../bashSchemas.js）
     * @returns ExecResult
     */
    async run(params: ExecToolParams): Promise<ExecResult> {
      // 1) 命令校验
      const validation = operations.validateCommand(params.command);
      if (!validation.allowed) {
        return {
          status: "failed",
          stdout: "",
          stderr: validation.reason ?? "Command rejected by sandbox policy",
          exitCode: null,
          exitSignal: null,
          durationMs: 0,
          timedOut: false,
          reason: validation.reason,
          failureKind: "aborted",
        };
      }

      // 2) 沙箱策略评估
      const sandboxResult = evaluateSandboxPolicy({
        command: params.command,
        cwd: params.workdir,
      });
      if (!sandboxResult.allowed) {
        return {
          status: "failed",
          stdout: "",
          stderr: sandboxResult.reason,
          exitCode: null,
          exitSignal: null,
          durationMs: 0,
          timedOut: false,
          reason: sandboxResult.reason,
          failureKind: "aborted",
        };
      }

      // 3) 超时 & env & cwd 解析
      const timeoutMs = operations.resolveTimeoutMs(params);
      const env = operations.buildEnv(params.env);
      const cwd = operations.resolveCwd(params.workdir);
      const maxOutputChars = operations.resolveMaxOutputChars();

      // 4) 输出事件发射器
      const events = new EventEmitter();
      const sessionId = `bash_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      const ctx: BashSpawnContext = {
        sessionId,
        command: params.command,
        cwd,
        backgrounded: params.background === true,
        events,
      };

      // 5) 委托 executeCommand 执行
      try {
        const execResult = await executeCommand({
          params: {
            ...params,
            timeout: timeoutMs > 0 ? Math.floor(timeoutMs / 1000) : undefined,
            env,
            workdir: cwd,
          },
          config: {
            sessionId,
            maxOutputChars,
            onStart: (session) => {
              ctx.pid = session.pid;
              for (const hook of hooks) {
                Promise.resolve(hook.onSpawn?.(ctx)).catch(() => {});
              }
              events.emit("spawn", ctx);
            },
            onUpdate: (output) => {
              events.emit("output", output);
            },
            onExit: (result) => {
              for (const hook of hooks) {
                Promise.resolve(hook.onExit?.(ctx, result)).catch(() => {});
              }
              events.emit("exit", result);
            },
          },
        });

        // 6) 错误退出时触发 onError hook
        if (execResult.status === "failed" && execResult.failureKind === "runtime-error") {
          const err = new Error(execResult.reason ?? "Bash execution failed");
          for (const hook of hooks) {
            Promise.resolve(hook.onError?.(ctx, err)).catch(() => {});
          }
          events.emit("error", err);
        }

        return execResult;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        for (const hook of hooks) {
          Promise.resolve(hook.onError?.(ctx, error)).catch(() => {});
        }
        events.emit("error", error);
        return {
          status: "failed",
          stdout: "",
          stderr: error.message,
          exitCode: null,
          exitSignal: null,
          durationMs: 0,
          timedOut: false,
          reason: error.message,
          failureKind: "runtime-error",
        };
      }
    },
  };
}

// ============================================================================
// 导出常量
// ============================================================================

export { DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
