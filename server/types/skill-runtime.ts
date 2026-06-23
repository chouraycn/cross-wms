/**
 * Skill Runtime Types — Skill 四层架构核心类型定义
 *
 * 定义 Skill 的完整生命周期类型，包括：
 * - SkillDefinition: 与 SKILL.md YAML frontmatter 对齐的技能定义
 * - SkillContext: 框架注入的执行上下文（log/sandbox/cache/lock/creds）
 * - SkillHandler / SkillLifecycle: 执行处理器与生命周期钩子
 * - RegisteredSkill: 注册表中的技能条目
 * - SkillScanConfig / SkillPermissionConfig: 扫描与权限配置
 *
 * 注意：项目使用 CommonJS 模块（tsconfig module: commonjs），但 import 路径使用 .js 后缀
 *       以兼容 ESM ↔ CJS 互操作（TypeScript 官方推荐做法）。
 */

// ===================== Skill 生命周期状态 =====================

/** Skill 生命周期状态机 */
export type SkillState =
  | 'unregistered'   // 未注册
  | 'discovered'     // 已发现（扫描到 SKILL.md）
  | 'validated'      // 已校验（frontmatter 合法）
  | 'enabled'        // 已启用（可被 Agent 发现）
  | 'disabled'       // 已禁用（存在但不可用）
  | 'active'         // 活跃（已初始化，等待执行）
  | 'running'        // 执行中
  | 'idle'           // 空闲（执行完毕，等待下一次调用）
  | 'cleaned';       // 已清理（资源释放）

// ===================== Skill 权限与安全 =====================

/** Skill 权限分组（对应 SKILL.md group 字段） */
export type SkillPermissionGroup =
  | 'fs_read'        // 文件系统读取
  | 'fs_write'       // 文件系统写入
  | 'runtime_exec'    // 运行时命令执行
  | 'browser'         // 浏览器操作
  | 'network'         // 网络访问
  | 'memory'          // 记忆/存储
  | 'wms'             // WMS 业务操作
  | 'system'          // 系统级操作
  | 'util'            // 工具类
  | 'custom';         // 自定义权限

/** Skill 门控模式（决定是否需要用户确认） */
export type SkillGate = 'auto' | 'manual' | 'ask';

/** Skill 沙箱范围 */
export type SandboxScope = 'workspace' | 'user' | 'system' | 'none';

// ===================== Skill 定义 =====================

/** Skill 依赖声明 */
export interface SkillRequires {
  /** 操作系统要求（如 ['darwin', 'linux']） */
  os?: string[];
  /** 环境变量要求（如 ['OPENAI_API_KEY']） */
  env?: string[];
  /** 依赖的其他 Skill ID 列表 */
  skills?: string[];
}

/**
 * Skill 定义（与 SKILL.md YAML frontmatter 对齐）
 *
 * id 命名规范：小写字母 + 下划线 + 数字（如 fs_read, calc, wms_query）
 */
export interface SkillDefinition {
  /** Skill 唯一标识符（如 'fs_read', 'calc'） */
  id: string;
  /** Skill 显示名称 */
  name: string;
  /** Skill 描述（用于 LLM tool description） */
  description: string;
  /** 权限分组 */
  group: SkillPermissionGroup;
  /** 参数 JSON Schema（OpenAI function parameters 格式） */
  parameters?: Record<string, unknown>;
  /** 依赖声明 */
  requires?: SkillRequires;
  /** 是否允许用户直接调用（默认 true） */
  userInvocable?: boolean;
  /** 门控模式（默认 'auto'） */
  gate?: SkillGate;
  /** 沙箱范围（默认 'workspace'） */
  sandboxScope?: SandboxScope;
  /** 版本号 */
  version?: string;
  /** 作者 */
  author?: string;
  /** 标签列表 */
  tags?: string[];

  // ---- 运行时信息（注册时填充） ----

  /** 来源类型 */
  source: 'builtin' | 'workspace' | 'user';
  /** SKILL.md 所在目录的绝对路径 */
  sourcePath?: string;
  /** SKILL.md 原始内容 */
  skillMdContent?: string;
  /** 从 SKILL.md body 提取的 instruction 代码块列表 */
  instructionBlocks?: string[];
}

// ===================== Skill 执行上下文 =====================

/** Skill 日志接口（框架注入） */
export interface SkillLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

/** Skill 沙箱接口（路径/网络/命令白名单校验） */
export interface SkillSandbox {
  /** 检查文件路径是否在允许范围内 */
  checkPath(path: string): { allowed: boolean; reason?: string };
  /** 检查网络 URL 是否在白名单内 */
  checkNetwork(url: string): { allowed: boolean; reason?: string };
  /** 检查命令是否在白名单内 */
  checkCommand(cmd: string): { allowed: boolean; reason?: string };
}

/** Skill 缓存接口（内存缓存，支持 TTL） */
export interface SkillCache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs?: number): void;
  del(key: string): void;
}

/** Skill 分布式锁接口（内存锁，后续可扩展 Redis） */
export interface SkillLock {
  acquire(key: string, ttlMs?: number): Promise<boolean>;
  release(key: string): Promise<void>;
}

/** Skill 凭证接口（从加密存储读取） */
export interface SkillCredentials {
  load(id: string): Promise<Record<string, string>>;
}

/**
 * Skill 执行上下文（框架注入）
 *
 * 每次执行 Skill 时由 SkillContextFactory 创建，
 * 注入 log/sandbox/cache/lock/creds 等框架能力。
 */
export interface SkillContext {
  /** 当前 Skill ID */
  skillId: string;
  /** 会话 ID */
  sessionId: string;
  /** Agent ID（可选） */
  agentId?: string;
  /** 工作区根目录 */
  workspace: string;
  /** 日志接口 */
  log: SkillLogger;
  /** 沙箱接口 */
  sandbox: SkillSandbox;
  /** 缓存接口 */
  cache: SkillCache;
  /** 分布式锁接口 */
  lock: SkillLock;
  /** 凭证接口 */
  creds: SkillCredentials;
}

// ===================== Skill 执行结果 =====================

/** Skill 执行结果 */
export interface SkillResult {
  /** 是否执行成功 */
  success: boolean;
  /** 返回数据（成功时） */
  data?: unknown;
  /** 错误信息（失败时） */
  error?: string;
  /** 执行元数据 */
  metadata?: {
    /** 执行耗时（毫秒） */
    durationMs: number;
    /** 沙箱检查次数 */
    sandboxChecks?: number;
    /** 是否获取到锁 */
    lockAcquired?: boolean;
  };
}

// ===================== Skill 执行处理器与生命周期 =====================

/**
 * Skill 执行处理器
 *
 * @param params - 调用参数（JSON Schema 校验后）
 * @param ctx - 框架注入的执行上下文
 * @returns 执行结果
 */
export type SkillHandler = (
  params: Record<string, unknown>,
  ctx: SkillContext,
) => Promise<SkillResult>;

/**
 * Skill 生命周期钩子
 *
 * 执行顺序：init → beforeExecute → execute → afterExecute → cleanup
 */
export interface SkillLifecycle {
  /** 初始化钩子（注册时调用一次） */
  init?(ctx: SkillContext): Promise<void>;
  /** 执行前钩子（可修改参数，返回 null 则跳过执行） */
  beforeExecute?(params: Record<string, unknown>, ctx: SkillContext): Promise<Record<string, unknown> | null>;
  /** 核心执行处理器（必须实现） */
  execute: SkillHandler;
  /** 执行后钩子（可修改结果） */
  afterExecute?(result: SkillResult, params: Record<string, unknown>, ctx: SkillContext): Promise<SkillResult>;
  /** 清理钩子（注销/关闭时调用） */
  cleanup?(ctx: SkillContext): Promise<void>;
}

// ===================== 注册表条目 =====================

/** 注册的 Skill 条目 */
export interface RegisteredSkill {
  /** Skill 定义 */
  definition: SkillDefinition;
  /** 生命周期钩子 */
  lifecycle: SkillLifecycle;
  /** 当前状态 */
  state: SkillState;
  /** 注册时间戳（Date.now()） */
  registeredAt: number;
  /** 最后执行时间戳 */
  lastExecutedAt?: number;
  /** 累计执行次数 */
  executionCount: number;
}

// ===================== 配置类型 =====================

/** Skill 扫描配置（三级目录） */
export interface SkillScanConfig {
  /** 工作区 Skill 目录（最高优先级） */
  workspaceDir: string;
  /** 用户全局 Skill 目录（中等优先级） */
  userGlobalDir: string;
  /** 内置 Skill 目录（最低优先级） */
  builtinDir: string;
}

/** Skill 权限配置 */
export interface SkillPermissionConfig {
  /** 允许的 group 或 skill id */
  allow: string[];
  /** 拒绝的 group 或 skill id（支持通配符 *） */
  deny: string[];
  /** 高危操作策略 */
  elevated: {
    enabled: 'ask' | 'auto' | 'deny';
  };
}
