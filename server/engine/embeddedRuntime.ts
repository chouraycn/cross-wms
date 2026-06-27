/**
 * Embedded Agent Runtime
 * 嵌入式 Agent 运行时 - 子进程沙箱执行环境
 */

export type RuntimeStatus = "idle" | "starting" | "running" | "paused" | "stopping" | "error" | "exited";
export type RuntimeType = "node" | "python" | "deno" | "bun" | "browser";
export type RuntimeMode = "sandbox" | "isolated" | "host";

export interface RuntimeConfig {
  type: RuntimeType;
  mode: RuntimeMode;
  timeoutMs?: number;
  memoryLimitMb?: number;
  cpuLimitPercent?: number;
  allowedModules?: string[];
  blockedModules?: string[];
  allowedPaths?: string[];
  blockedPaths?: string[];
  allowNetwork?: boolean;
  allowFsWrite?: boolean;
  allowFsRead?: boolean;
  allowSubprocess?: boolean;
  env?: Record<string, string>;
  workingDir?: string;
  maxOutputSize?: number;
}

export interface RuntimeInstance {
  id: string;
  type: RuntimeType;
  mode: RuntimeMode;
  status: RuntimeStatus;
  config: RuntimeConfig;
  pid?: number;
  startedAt?: number;
  stoppedAt?: number;
  lastActiveAt?: number;
  memoryUsage?: number;
  cpuUsage?: number;
  totalExecutions: number;
  successCount: number;
  errorCount: number;
  totalDurationMs: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionRequest {
  code: string;
  language?: string;
  args?: string[];
  timeoutMs?: number;
  stdin?: string;
  files?: Record<string, string>;
}

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode?: number;
  durationMs: number;
  memoryUsage?: number;
  timedOut?: boolean;
  error?: string;
  outputTruncated?: boolean;
  files?: Record<string, string>;
}

export interface RuntimePoolConfig {
  minInstances: number;
  maxInstances: number;
  idleTimeoutMs: number;
  defaultConfig: Partial<RuntimeConfig>;
}

class EmbeddedAgentRuntime {
  private readonly instances = new Map<string, RuntimeInstance>();
  private poolConfig: RuntimePoolConfig = {
    minInstances: 0,
    maxInstances: 10,
    idleTimeoutMs: 5 * 60 * 1000,
    defaultConfig: {
      type: "node",
      mode: "sandbox",
      timeoutMs: 30000,
      memoryLimitMb: 256,
      allowNetwork: false,
      allowFsWrite: false,
      allowFsRead: true,
      allowSubprocess: false,
      maxOutputSize: 1024 * 1024,
    },
  };

  constructor() {
    // 空构造函数
  }

  // ========== Instance Management ==========

  async createInstance(config?: Partial<RuntimeConfig>): Promise<RuntimeInstance> {
    const activeCount = this.instances.size;
    if (activeCount >= this.poolConfig.maxInstances) {
      throw new Error(
        `Runtime pool exhausted: ${activeCount}/${this.poolConfig.maxInstances} instances`,
      );
    }

    const id = `rt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fullConfig: RuntimeConfig = {
      ...this.poolConfig.defaultConfig,
      ...config,
    } as RuntimeConfig;

    const instance: RuntimeInstance = {
      id,
      type: fullConfig.type,
      mode: fullConfig.mode,
      status: "starting",
      config: fullConfig,
      totalExecutions: 0,
      successCount: 0,
      errorCount: 0,
      totalDurationMs: 0,
    };

    this.instances.set(id, instance);

    try {
      await this.simulateRuntimeStartup(instance);
      instance.status = "running";
      instance.startedAt = Date.now();
      instance.lastActiveAt = Date.now();
      instance.pid = Math.floor(Math.random() * 60000) + 1000;
    } catch (error) {
      instance.status = "error";
      instance.errorMessage = error instanceof Error ? error.message : String(error);
      this.instances.set(id, instance);
      throw error;
    }

    this.instances.set(id, instance);
    return instance;
  }

  private async simulateRuntimeStartup(instance: RuntimeInstance): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 200));

    if (instance.config.mode === "sandbox") {
      // 模拟沙箱初始化
      instance.memoryUsage = 10;
    }
  }

  async destroyInstance(instanceId: string): Promise<boolean> {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    if (instance.status === "exited" || instance.status === "idle") {
      return this.instances.delete(instanceId);
    }

    instance.status = "stopping";
    this.instances.set(instanceId, instance);

    await new Promise((resolve) => setTimeout(resolve, 100));

    instance.status = "exited";
    instance.stoppedAt = Date.now();
    this.instances.set(instanceId, instance);

    // 延迟清理
    setTimeout(() => {
      this.instances.delete(instanceId);
    }, 1000);

    return true;
  }

  getInstance(instanceId: string): RuntimeInstance | undefined {
    return this.instances.get(instanceId);
  }

  listInstances(status?: RuntimeStatus): RuntimeInstance[] {
    let instances = Array.from(this.instances.values());
    if (status) {
      instances = instances.filter((i) => i.status === status);
    }
    return instances.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  }

  // ========== Code Execution ==========

  async execute(instanceId: string, request: ExecutionRequest): Promise<ExecutionResult> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Runtime instance not found: ${instanceId}`);
    }

    if (instance.status !== "running" && instance.status !== "idle") {
      throw new Error(`Runtime not available: ${instance.status}`);
    }

    const startTime = Date.now();
    const timeout = request.timeoutMs ?? instance.config.timeoutMs ?? 30000;

    instance.status = "running";
    instance.totalExecutions++;
    instance.lastActiveAt = Date.now();
    this.instances.set(instanceId, instance);

    try {
      const result = await this.simulateExecution(instance, request, timeout);

      instance.successCount++;
      instance.totalDurationMs += result.durationMs;
      instance.memoryUsage = Math.min(
        (instance.config.memoryLimitMb ?? 256),
        (instance.memoryUsage ?? 0) + Math.random() * 5,
      );

      if (this.instances.has(instanceId)) {
        instance.status = "idle";
        this.instances.set(instanceId, instance);
      }

      return result;
    } catch (error) {
      instance.errorCount++;

      const result: ExecutionResult = {
        success: false,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };

      if (this.instances.has(instanceId)) {
        instance.status = "idle";
        this.instances.set(instanceId, instance);
      }

      return result;
    }
  }

  private async simulateExecution(
    instance: RuntimeInstance,
    request: ExecutionRequest,
    timeout: number,
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // 安全检查
    const safetyCheck = this.performSafetyCheck(instance, request);
    if (!safetyCheck.passed) {
      return {
        success: false,
        stdout: "",
        stderr: `Security violation: ${safetyCheck.reason}`,
        durationMs: Date.now() - startTime,
        error: safetyCheck.reason,
      };
    }

    // 模拟执行
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Execution timed out"));
      }, timeout);

      setTimeout(() => {
        clearTimeout(timer);
        resolve(null);
      }, Math.min(timeout - 100, 100 + Math.random() * 200));
    });

    const duration = Date.now() - startTime;
    const output = `[${instance.type} runtime] Execution completed\nInput: ${request.code.slice(0, 100)}${request.code.length > 100 ? "..." : ""}`;

    return {
      success: true,
      stdout: output,
      stderr: "",
      exitCode: 0,
      durationMs: duration,
      memoryUsage: 15 + Math.random() * 10,
    };
  }

  private performSafetyCheck(
    instance: RuntimeInstance,
    request: ExecutionRequest,
  ): { passed: boolean; reason?: string } {
    const config = instance.config;
    const code = request.code;

    // 检查危险模式
    if (config.mode === "sandbox" || config.mode === "isolated") {
      // 危险命令检测
      const dangerousPatterns = [
        /\brm\s+-rf\s+\/\b/,
        /\bmkfs\b/,
        /\bdd\s+if=/,
        /eval\s*\(/,
        /require\s*\(\s*['"]child_process['"]\s*\)/,
        /process\.exit/,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(code)) {
          return { passed: false, reason: `Dangerous pattern detected: ${pattern}` };
        }
      }

      // 网络访问检查
      if (!config.allowNetwork) {
        if (/\b(fetch|http\.request|axios|XMLHttpRequest|WebSocket)\b/.test(code)) {
          return { passed: false, reason: "Network access not allowed in sandbox mode" };
        }
      }

      // 文件写入检查
      if (!config.allowFsWrite) {
        if (/\b(fs\.write|fs\.append|writeFile|createWriteStream)\b/.test(code)) {
          return { passed: false, reason: "File write not allowed in sandbox mode" };
        }
      }

      // 子进程检查
      if (!config.allowSubprocess) {
        if (/\b(exec|spawn|fork|execFile)\b/.test(code)) {
          return { passed: false, reason: "Subprocess execution not allowed in sandbox mode" };
        }
      }
    }

    // 检查禁止模块
    if (config.blockedModules && config.blockedModules.length > 0) {
      for (const mod of config.blockedModules) {
        const pattern = new RegExp(`require\\s*\\(\\s*['"]${mod}['"]\\s*\\)`);
        if (pattern.test(code)) {
          return { passed: false, reason: `Module not allowed: ${mod}` };
        }
      }
    }

    return { passed: true };
  }

  // ========== Pool Management ==========

  setPoolConfig(config: Partial<RuntimePoolConfig>): void {
    this.poolConfig = { ...this.poolConfig, ...config };
  }

  getPoolConfig(): RuntimePoolConfig {
    return { ...this.poolConfig };
  }

  async ensureMinimumInstances(): Promise<void> {
    const current = this.listInstances().filter(
      (i) => i.status === "running" || i.status === "idle" || i.status === "starting",
    ).length;

    const needed = this.poolConfig.minInstances - current;
    for (let i = 0; i < needed; i++) {
      try {
        await this.createInstance();
      } catch (e) {
        console.error("[runtime] Failed to pre-warm instance:", e);
      }
    }
  }

  cleanupIdleInstances(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, instance] of this.instances) {
      if (
        instance.status === "idle" &&
        instance.lastActiveAt &&
        now - instance.lastActiveAt > this.poolConfig.idleTimeoutMs
      ) {
        this.destroyInstance(id).catch(() => {});
        cleaned++;
      }
    }

    return cleaned;
  }

  // ========== Stats ==========

  getStats(): {
    totalInstances: number;
    running: number;
    idle: number;
    starting: number;
    stopping: number;
    error: number;
    exited: number;
    totalExecutions: number;
    successRate: number;
    avgDurationMs: number;
    totalMemoryMb: number;
  } {
    const instances = Array.from(this.instances.values());
    const totalExec = instances.reduce((sum, i) => sum + i.totalExecutions, 0);
    const totalSuccess = instances.reduce((sum, i) => sum + i.successCount, 0);
    const totalDuration = instances.reduce((sum, i) => sum + i.totalDurationMs, 0);
    const totalMemory = instances.reduce((sum, i) => sum + (i.memoryUsage ?? 0), 0);

    return {
      totalInstances: instances.length,
      running: instances.filter((i) => i.status === "running").length,
      idle: instances.filter((i) => i.status === "idle").length,
      starting: instances.filter((i) => i.status === "starting").length,
      stopping: instances.filter((i) => i.status === "stopping").length,
      error: instances.filter((i) => i.status === "error").length,
      exited: instances.filter((i) => i.status === "exited").length,
      totalExecutions: totalExec,
      successRate: totalExec > 0 ? totalSuccess / totalExec : 1,
      avgDurationMs: totalExec > 0 ? totalDuration / totalExec : 0,
      totalMemoryMb: totalMemory,
    };
  }

  clear(): void {
    for (const id of this.instances.keys()) {
      this.destroyInstance(id).catch(() => {});
    }
    this.instances.clear();
  }
}

const RUNTIME_INSTANCE = new EmbeddedAgentRuntime();

export function getEmbeddedRuntime(): EmbeddedAgentRuntime {
  return RUNTIME_INSTANCE;
}

export async function createRuntime(
  config?: Partial<RuntimeConfig>,
): Promise<RuntimeInstance> {
  return RUNTIME_INSTANCE.createInstance(config);
}

export async function executeInRuntime(
  instanceId: string,
  request: ExecutionRequest,
): Promise<ExecutionResult> {
  return RUNTIME_INSTANCE.execute(instanceId, request);
}

export function resetEmbeddedRuntimeForTests(): void {
  RUNTIME_INSTANCE.clear();
}

export type { EmbeddedAgentRuntime };
