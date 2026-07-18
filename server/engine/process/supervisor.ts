/**
 * 进程监督器
 *
 * 集成 spawner + lifecycle + timeout + restart-policy + monitor + error-handler。
 * 启动一个进程：spawn adapter -> 注册到 lifecycle -> arm timeout -> 等待退出 -> 按 policy 决定是否重启。
 */

import crypto from 'node:crypto';
import { logger } from '../../logger.js';
import { ProcessErrorHandler } from './error-handler.js';
import { LifecycleManager } from './lifecycle.js';
import { ProcessMonitor, type MonitorConfig } from './monitor.js';
import { ProcessCommunicator } from './communicator.js';
import {
  DEFAULT_RESTART_POLICY,
  RestartPolicy,
  RestartPolicyRegistry,
  type RestartPolicyConfig,
} from './restart-policy.js';
import { createSpawnAdapter, appendCapturedOutput, resolveMaxCapturedChars, type SpawnDeps } from './spawner.js';
import { TimeoutController } from './timeout.js';
import type {
  ManagedProcess,
  ProcessConfig,
  ProcessExitInfo,
  ProcessSnapshot,
  SpawnAdapter,
  TerminationReason,
} from './types.js';

/** Supervisor 依赖注入 */
export interface SupervisorDeps {
  spawnDeps?: SpawnDeps;
  monitorConfig?: Omit<MonitorConfig, 'sampler'>;
  restartPolicyRegistry?: RestartPolicyRegistry;
  now?: () => number;
  generateId?: () => string;
  sleep?: (ms: number) => Promise<void>;
  scheduler?: typeof setTimeout;
  clearer?: typeof clearTimeout;
}

/** 进程启动选项 */
export interface StartOptions {
  /** 自定义 id（默认随机生成） */
  id?: string;
  /** 启动后是否自动应用 restart-policy（默认 true） */
  autoRestart?: boolean;
}

/** Start 结果 */
export interface StartResult {
  process: ManagedProcess;
}

const DEFAULT_GRACEFUL_STOP_TIMEOUT_MS = 5_000;

/** 内部跟踪一个进程的所有运行时数据 */
interface ProcessRuntimeSlot {
  id: string;
  config: ProcessConfig;
  adapter: SpawnAdapter;
  startedAtMs: number;
  timeoutController: TimeoutController | null;
  forcedReason: TerminationReason | null;
  settled: boolean;
  exitResolve: ((exit: ProcessExitInfo) => void) | null;
  exitPromise: Promise<ProcessExitInfo>;
  monitor: ProcessMonitor | null;
  communicator: ProcessCommunicator | null;
}

/**
 * 进程监督器
 *
 * 一个实例维护一组受管理进程；start/stop/list 是主入口。
 */
export class ProcessSupervisor {
  private readonly lifecycle = new LifecycleManager();
  private readonly errorHandler = new ProcessErrorHandler();
  private readonly slots = new Map<string, ProcessRuntimeSlot>();
  private readonly restartPolicies: RestartPolicyRegistry;
  private readonly deps: Required<Omit<SupervisorDeps, 'spawnDeps' | 'monitorConfig' | 'restartPolicyRegistry'>> & {
    spawnDeps?: SpawnDeps;
    monitorConfig?: Omit<MonitorConfig, 'sampler'>;
    restartPolicyRegistry?: RestartPolicyRegistry;
  };

  constructor(deps?: SupervisorDeps) {
    this.deps = {
      spawnDeps: deps?.spawnDeps,
      monitorConfig: deps?.monitorConfig,
      restartPolicyRegistry: deps?.restartPolicyRegistry,
      now: deps?.now ?? (() => Date.now()),
      generateId: deps?.generateId ?? (() => crypto.randomUUID()),
      sleep: deps?.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      scheduler: deps?.scheduler ?? setTimeout,
      clearer: deps?.clearer ?? clearTimeout,
    };
    this.restartPolicies = deps?.restartPolicyRegistry ?? new RestartPolicyRegistry();
  }

  /** 启动一个进程 */
  async start(config: ProcessConfig, options?: StartOptions): Promise<StartResult> {
    const id = options?.id ?? this.deps.generateId();
    if (this.slots.has(id)) {
      throw new Error(`process ${id} already exists`);
    }
    const now = this.deps.now();
    this.lifecycle.register(id, config.name, now);
    this.lifecycle.setState(id, 'starting', 'spawn', now);

    let adapter: SpawnAdapter;
    try {
      adapter = createSpawnAdapter(config, this.deps.spawnDeps);
    } catch (err) {
      this.lifecycle.finalize(
        id,
        {
          reason: 'spawn-error',
          exitCode: null,
          exitSignal: null,
          durationMs: this.deps.now() - now,
          timedOut: false,
        },
        this.deps.now(),
      );
      throw err;
    }

    // exitPromise 由 setupExitWait 中的 adapter.wait() 触发 resolve；
    // resolver 引用保存在 slot.exitResolve，wait() 通过 slot.exitPromise 等待。
    let exitResolve!: (exit: ProcessExitInfo) => void;
    const exitPromise = new Promise<ProcessExitInfo>((resolve) => {
      exitResolve = resolve;
    });

    const slot: ProcessRuntimeSlot = {
      id,
      config,
      adapter,
      startedAtMs: now,
      timeoutController: null,
      forcedReason: null,
      settled: false,
      exitResolve: (exit) => exitResolve(exit),
      exitPromise,
      monitor: null,
      communicator: null,
    };
    this.slots.set(id, slot);

    if (adapter.pid !== undefined) {
      this.lifecycle.setPid(id, adapter.pid);
      const monitor = new ProcessMonitor(adapter.pid, {
        ...(this.deps.monitorConfig ?? {}),
        now: this.deps.now,
      } as MonitorConfig);
      monitor.start();
      slot.monitor = monitor;
    }

    const communicator = new ProcessCommunicator(adapter, {
      onStdout: () => this.lifecycle.touchOutput(id, this.deps.now()),
      onStderr: () => this.lifecycle.touchOutput(id, this.deps.now()),
    });
    slot.communicator = communicator;

    // 设置 timeout 控制器
    const timeoutController = new TimeoutController({
      overallTimeoutMs: config.timeoutMs,
      idleTimeoutMs: config.idleTimeoutMs,
      onTimeout: (reason) => {
        if (slot.forcedReason) return;
        slot.forcedReason = reason;
        adapter.kill('SIGTERM');
      },
      scheduler: this.deps.scheduler,
      clearer: this.deps.clearer,
      now: this.deps.now,
    });
    slot.timeoutController = timeoutController;
    timeoutController.arm();

    // 输出活动 -> 重置 idle timer
    adapter.onStdout(() => timeoutController.touchOutput());
    adapter.onStderr(() => timeoutController.touchOutput());

    this.lifecycle.setState(id, 'running', 'spawned', this.deps.now());

    // 启动退出等待（不阻塞）
    void this.setupExitWait(slot);

    const managedProcess: ManagedProcess = {
      id,
      pid: adapter.pid,
      name: config.name,
      state: 'running',
      startedAtMs: now,
      lastOutputAtMs: now,
      config,
      wait: () => slot.exitPromise,
      stop: (reason?: TerminationReason) => this.stop(id, reason),
      writeStdin: (data: string) => communicator.writeStdin(data),
      sendSignal: (signal: NodeJS.Signals) => communicator.sendSignal(signal),
    };
    return { process: managedProcess };
  }

  /** 停止一个进程：先 SIGTERM 后 SIGKILL */
  stop(id: string, reason: TerminationReason = 'manual-stop'): void {
    const slot = this.slots.get(id);
    if (!slot) {
      return;
    }
    if (slot.forcedReason) {
      return;
    }
    slot.forcedReason = reason;
    slot.timeoutController?.clear();
    this.lifecycle.setState(id, 'stopping', reason, this.deps.now());
    slot.adapter.kill('SIGTERM');
    // 超时升级 SIGKILL
    const timer = this.deps.scheduler(() => {
      if (!slot.settled) {
        slot.adapter.kill('SIGKILL');
      }
    }, DEFAULT_GRACEFUL_STOP_TIMEOUT_MS);
    timer.unref?.();
  }

  /** 重启一个进程：先停止再启动（用相同 config） */
  async restart(id: string): Promise<StartResult> {
    const slot = this.slots.get(id);
    if (!slot) {
      throw new Error(`process ${id} not found`);
    }
    const config = slot.config;
    this.stop(id, 'restart-policy-stop');
    await slot.exitPromise;
    // 用新 id 避免冲突；如果想保留 id 可以在 wait 完成后 reuse
    return await this.start(config, { autoRestart: true });
  }

  /** 列出所有进程快照 */
  list(): ProcessSnapshot[] {
    return this.lifecycle.list().map((r) => {
      const slot = this.slots.get(r.id);
      return {
        id: r.id,
        pid: r.pid,
        name: r.name,
        state: r.state,
        startedAtMs: r.startedAtMs,
        lastOutputAtMs: r.lastOutputAtMs,
        restartCount: r.restartCount,
        uptimeMs: this.deps.now() - r.startedAtMs,
        usage: slot?.monitor?.last() ?? undefined,
        health: 'unknown',
      };
    });
  }

  /** 获取一个进程 */
  get(id: string): ManagedProcess | undefined {
    const slot = this.slots.get(id);
    const record = this.lifecycle.get(id);
    if (!slot || !record) {
      return undefined;
    }
    return {
      id,
      pid: slot.adapter.pid,
      name: record.name,
      state: record.state,
      startedAtMs: record.startedAtMs,
      lastOutputAtMs: record.lastOutputAtMs,
      config: slot.config,
      wait: () => slot.exitPromise,
      stop: (reason?: TerminationReason) => this.stop(id, reason),
      writeStdin: (data: string) => slot.communicator?.writeStdin(data),
      sendSignal: (signal: NodeJS.Signals) => slot.communicator?.sendSignal(signal),
    };
  }

  /** 取消一个进程（同 stop） */
  cancel(id: string, reason: TerminationReason = 'manual-stop'): void {
    this.stop(id, reason);
  }

  /** 取消某个 name 的所有进程 */
  cancelScope(name: string, reason: TerminationReason = 'manual-stop'): void {
    for (const [id, slot] of this.slots.entries()) {
      if (slot.config.name === name) {
        this.stop(id, reason);
      }
    }
  }

  /** 暴露 lifecycle（用于测试与扩展） */
  getLifecycle(): LifecycleManager {
    return this.lifecycle;
  }

  /** 内部：监听 adapter.wait() 完成并触发后续处理 */
  private async setupExitWait(slot: ProcessRuntimeSlot): Promise<void> {
    const { id, adapter, config, startedAtMs } = slot;
    let stdout = '';
    let stderr = '';
    const captureOutput = config.captureOutput !== false;
    const maxChars = resolveMaxCapturedChars(config.maxCapturedOutputChars);
    if (captureOutput) {
      adapter.onStdout((chunk) => {
        stdout = appendCapturedOutput(stdout, chunk, 'stdout', maxChars);
      });
      adapter.onStderr((chunk) => {
        stderr = appendCapturedOutput(stderr, chunk, 'stderr', maxChars);
      });
    }
    let result: { code: number | null; signal: NodeJS.Signals | null };
    try {
      result = await adapter.wait();
    } catch (err) {
      result = { code: null, signal: null };
      logger.warn(`[Process:Supervisor] wait threw for ${id}: ${err}`);
    }
    if (slot.settled) {
      return;
    }
    slot.settled = true;
    slot.timeoutController?.dispose();
    const now = this.deps.now();
    const deadlineReason = slot.timeoutController?.resolveElapsedReason(now) ?? null;
    const forcedReason = slot.forcedReason ?? deadlineReason;
    const classified = this.errorHandler.classify({
      exitCode: result.code,
      signal: result.signal,
      durationMs: now - startedAtMs,
      timeoutMs: config.timeoutMs,
      config,
    });
    const reason: TerminationReason = forcedReason ?? classified.suggestedReason;
    const exit: ProcessExitInfo = {
      reason,
      exitCode: result.code,
      exitSignal: result.signal,
      durationMs: now - startedAtMs,
      timedOut: reason === 'overall-timeout' || reason === 'idle-timeout',
    };
    this.errorHandler.handle(classified, config, id);
    this.lifecycle.finalize(id, exit, now);
    slot.exitResolve?.(exit);
    this.cleanupSlot(id);

    // 自动重启：仅当配置了 restartPolicyId 时
    if (config.restartPolicyId) {
      void this.maybeRestart(id, config, reason);
    }
  }

  /** 内部：根据 policy 决定是否重启 */
  private async maybeRestart(id: string, config: ProcessConfig, reason: TerminationReason): Promise<void> {
    const policyConfig = this.resolvePolicy(config);
    if (policyConfig.mode === 'never' || policyConfig.maxAttempts <= 0) {
      return;
    }
    const policy = new RestartPolicy(policyConfig, { now: this.deps.now });
    if (!policy.shouldRestart(reason)) {
      return;
    }
    policy.recordRestart(reason);
    const delay = policy.nextDelayMs();
    if (delay > 0) {
      await this.deps.sleep(delay);
    }
    // 用新 id 启动，避免与旧的记录冲突
    const record = this.lifecycle.get(id);
    if (record) {
      this.lifecycle.incrementRestart(id);
    }
    try {
      await this.start(config, { autoRestart: true });
      logger.debug(`[Process:Supervisor] restarted ${config.name} after ${reason}`);
    } catch (err) {
      logger.warn(`[Process:Supervisor] restart failed for ${config.name}: ${err}`);
    }
  }

  private resolvePolicy(config: ProcessConfig): RestartPolicyConfig {
    if (!config.restartPolicyId) {
      return DEFAULT_RESTART_POLICY;
    }
    return this.restartPolicies.resolve(config.restartPolicyId);
  }

  private cleanupSlot(id: string): void {
    const slot = this.slots.get(id);
    if (!slot) {
      return;
    }
    slot.monitor?.stop();
    slot.monitor = null;
    slot.communicator = null;
    slot.adapter.dispose();
    this.slots.delete(id);
  }
}
