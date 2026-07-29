// 老插件测试的宽兼容大桶。
// @deprecated 原 openclaw 实现从 ../channels/**、../cli/**、../plugins/**、
// ../agents/**、../test-utils/** 等大量未移植模块重导出。此处提供最常用测试辅助的最小可用实现。
// 新测试应导入更聚焦的 plugin-sdk 子路径：plugin-test-runtime、channel-test-helpers、test-env、test-fixtures。

/** Mock 函数类型。 */
export type MockFn<T extends (...args: any[]) => any = (...args: any[]) => any> = T & {
  /** 调用记录。 */
  calls: Parameters<T>[];
  /** 返回值记录。 */
  results: ReturnType<T>[];
  /** 重置 mock。 */
  mockReset(): void;
  /** 设置返回值。 */
  mockReturnValue(value: ReturnType<T>): void;
  /** 设置实现。 */
  mockImplementation(impl: T): void;
};

/** 创建 mock 函数。 */
export function fn<T extends (...args: any[]) => any>(impl?: T): MockFn<T> {
  let currentImpl = impl ?? (() => undefined as ReturnType<T>);
  let returnValue: ReturnType<T> | undefined;
  let useReturnValue = false;
  const calls: Parameters<T>[] = [];
  const results: ReturnType<T>[] = [];
  const mock = ((...args: Parameters<T>) => {
    calls.push(args);
    const result = useReturnValue ? (returnValue as ReturnType<T>) : currentImpl(...args);
    results.push(result);
    return result;
  }) as MockFn<T>;
  mock.calls = calls;
  mock.results = results;
  mock.mockReset = () => {
    calls.length = 0;
    results.length = 0;
    useReturnValue = false;
    returnValue = undefined;
    currentImpl = (() => undefined) as T;
  };
  mock.mockReturnValue = (value: ReturnType<T>) => {
    returnValue = value;
    useReturnValue = true;
  };
  mock.mockImplementation = (implFn: T) => {
    currentImpl = implFn;
    useReturnValue = false;
  };
  return mock;
}

/** 捕获并恢复环境变量。 */
export function captureEnv(): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  return new Proxy(snapshot, {
    get(_target, prop: string) {
      return process.env[prop];
    },
  });
}

/** 在指定环境变量下同步执行函数，执行后恢复。 */
export function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    snapshot[key] = process.env[key];
    const value = env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(snapshot)) {
      const value = snapshot[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

/** 在指定环境变量下异步执行函数，执行后恢复。 */
export async function withEnvAsync<T>(
  env: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    snapshot[key] = process.env[key];
    const value = env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(snapshot)) {
      const value = snapshot[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

/** 临时家目录环境。 */
export type TempHomeEnv = {
  /** 临时家目录路径。 */
  homeDir: string;
  /** 恢复环境变量。 */
  restore(): void;
};

// TODO: 依赖模块未移植，暂用本地桩
export function createTempHomeEnv(_prefix?: string): TempHomeEnv {
  const homeDir = `/tmp/openclaw-test-home-${Date.now()}`;
  return {
    homeDir,
    restore() {
      // 待 test-utils/temp-home.js 移植后接入真实清理
    },
  };
}

/** 在临时目录下执行函数。 */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = `/tmp/openclaw-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return fn(dir);
}

/** 类型安全的测试用例构造。 */
export function typedCases<T>(cases: T[]): T[] {
  return cases;
}

/** 判断是否启用 live 测试。 */
export function isLiveTestEnabled(): boolean {
  return isTruthyEnvValue(process.env.OPENCLAW_LIVE_TEST);
}

/** 判断是否启用 live profile key 模式。 */
export function isLiveProfileKeyModeEnabled(): boolean {
  return isTruthyEnvValue(process.env.OPENCLAW_LIVE_PROFILE_KEY);
}

/** 判断环境变量值是否为真值。 */
export function isTruthyEnvValue(value: string | undefined | null): boolean {
  if (value == null) return false;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

/** 从响应中提取非空助手文本。 */
export function extractNonEmptyAssistantText(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (const msg of messages) {
    if (msg && typeof msg === "object" && "role" in msg && "content" in msg) {
      const role = (msg as { role: string }).role;
      const content = (msg as { content: unknown }).content;
      if (role === "assistant" && typeof content === "string" && content.trim()) {
        return content;
      }
    }
  }
  return undefined;
}

/** 创建单用户 prompt 消息。 */
export function createSingleUserPromptMessage(text: string): { role: string; content: string } {
  return { role: "user", content: text };
}

// ---- 版本比较 ----

/** 解析 semver 字符串。 */
export function parseSemver(input: string): { major: number; minor: number; patch: number } | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(input.trim());
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/** 判断版本 a 是否 >= b。 */
export function isAtLeast(a: string, b: string): boolean {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return false;
  if (pa.major !== pb.major) return pa.major > pb.major;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor;
  return pa.patch >= pb.patch;
}

// ---- HTTP 测试辅助 ----

/** 构造 JSON 响应。 */
export function makeResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** 从请求中读取 body 文本。 */
export async function requestBodyText(request: Request): Promise<string> {
  return request.text();
}

/** 从请求 URL 中提取路径。 */
export function requestUrl(request: Request): string {
  return new URL(request.url).pathname;
}

/** 创建 JSON 响应辅助。 */
export function jsonResponse(body: unknown, status = 200): Response {
  return makeResponse(body, status);
}

// ---- 终端文本 ----

/** 清理终端文本，去除控制序列。 */
export function sanitizeTerminalText(text: string): string {
  // 去除 ANSI 转义序列
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

// ---- 计数辅助 ----

/** 统计文本行数。 */
export function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}

/** 判断 markdown 围栏是否平衡。 */
export function hasBalancedFences(text: string): boolean {
  const matches = text.match(/```/g);
  return matches === null || matches.length % 2 === 0;
}

// ---- 时间冻结 ----

/** 在冻结时间下执行函数。 */
export function useFrozenTime<T>(timeMs: number, fn: () => T): T {
  const originalNow = Date.now;
  const fixed = () => timeMs;
  Date.now = fixed;
  try {
    return fn();
  } finally {
    Date.now = originalNow;
  }
}

/** 恢复真实时间。 */
export function useRealTime(): void {
  // 仅在 useFrozenTime 之后有意义；此处为 no-op 占位
}

// ---- 运行时环境创建 ----

/** 创建运行时环境（测试用）。 */
export function createRuntimeEnv(): RuntimeEnvShape {
  return {
    stdout: { write: () => true },
    stderr: { write: () => true },
    exit: () => undefined,
  };
}

/** 创建不会退出的运行时环境。 */
export function createNonExitingRuntimeEnv(): RuntimeEnvShape {
  return createRuntimeEnv();
}

/** 创建带类型的运行时环境。 */
export function createTypedRuntimeEnv(): RuntimeEnvShape {
  return createRuntimeEnv();
}

/** 创建不会退出的带类型运行时环境。 */
export function createNonExitingTypedRuntimeEnv(): RuntimeEnvShape {
  return createRuntimeEnv();
}

/** 运行时环境形状。 */
type RuntimeEnvShape = {
  stdout: { write(text: string): boolean };
  stderr: { write(text: string): boolean };
  exit(code?: number): void;
};

/** 运行时环境类型（公共导出）。 */
export type RuntimeEnv = RuntimeEnvShape;

// ---- 插件注册捕获 ----

/** 捕获的插件注册信息。 */
export type CapturedPluginRegistration = {
  pluginId: string;
  manifest?: unknown;
};

// TODO: 依赖模块未移植，暂用本地桩
export function capturePluginRegistration(): CapturedPluginRegistration | undefined {
  return undefined;
}

// TODO: 依赖模块未移植，暂用本地桩
export function createCapturedPluginRegistration(pluginId: string): CapturedPluginRegistration {
  return { pluginId };
}

/** 构建插件 API。 */
// TODO: 依赖模块未移植，暂用本地桩
export function buildPluginApi(_runtime: unknown): unknown {
  return {};
}

// ---- 向导提示器 ----

/** 向导提示器。 */
export type WizardPrompter = {
  prompt(message: string, defaultValue?: string): Promise<string>;
  select(message: string, options: string[]): Promise<string>;
};

/** 创建测试用向导提示器。 */
export function createTestWizardPrompter(answers: Record<string, string> = {}): WizardPrompter {
  return {
    async prompt(message, defaultValue) {
      return answers[message] ?? defaultValue ?? "";
    },
    async select(message, options) {
      return answers[message] ?? options[0] ?? "";
    },
  };
}

/** 创建排队向导提示器。 */
export function createQueuedWizardPrompter(queue: Array<{ message: string; answer: string }> = []): WizardPrompter {
  const remaining = [...queue];
  return {
    async prompt(message, defaultValue) {
      const next = remaining.shift();
      return next?.answer ?? defaultValue ?? "";
    },
    async select(_message, options) {
      const next = remaining.shift();
      return next?.answer ?? options[0] ?? "";
    },
  };
}

/** 选择第一个向导选项。 */
export function selectFirstWizardOption(_message: string, options: string[]): string {
  return options[0] ?? "";
}

// TODO: 依赖模块未移植，暂用本地桩
export function createSetupWizardAdapter(): unknown {
  return {};
}

// TODO: 依赖模块未移植，暂用本地桩
export function createPluginSetupWizardAdapter(): unknown {
  return {};
}

// TODO: 依赖模块未移植，暂用本地桩
export function createPluginSetupWizardConfigure(): unknown {
  return {};
}

// TODO: 依赖模块未移植，暂用本地桩
export function createPluginSetupWizardStatus(): unknown {
  return {};
}

// TODO: 依赖模块未移植，暂用本地桩
export function promptSetupWizardAllowFrom(_prompter: WizardPrompter): Promise<string[]> {
  return Promise.resolve([]);
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveSetupWizardAllowFromEntries(): string[] {
  return [];
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveSetupWizardGroupAllowlist(): string[] {
  return [];
}

// TODO: 依赖模块未移植，暂用本地桩
export async function runSetupWizardConfigure(_prompter: WizardPrompter): Promise<void> {}

// TODO: 依赖模块未移植，暂用本地桩
export async function runSetupWizardFinalize(_prompter: WizardPrompter): Promise<void> {}

// TODO: 依赖模块未移植，暂用本地桩
export async function runSetupWizardPrepare(_prompter: WizardPrompter): Promise<void> {}

// ---- Mock 插件注册表 ----

// TODO: 依赖模块未移植，暂用本地桩
export function createMockPluginRegistry(): unknown {
  return {};
}

// TODO: 依赖模块未移植，暂用本地桩
export function createEmptyPluginRegistry(): unknown {
  return {};
}

// TODO: 依赖模块未移植，暂用本地桩
export function createPluginRegistry(): unknown {
  return {};
}

/** 插件记录。 */
export type PluginRecord = {
  id: string;
  manifest?: unknown;
  status?: string;
};

// TODO: 依赖模块未移植，暂用本地桩
export function createPluginRecord(id: string): PluginRecord {
  return { id, status: "active" };
}

// TODO: 依赖模块未移植，暂用本地桩
export function addTestHook(_hook: unknown): () => void {
  return () => {};
}
