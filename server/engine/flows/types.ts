/**
 * 流程类型定义 — 参考 openclaw/src/flows/types.ts
 *
 * 为 setup、onboarding、doctor 流程提供共享的选项/贡献契约与健康检查类型。
 * 不依赖 @openclaw/* 包，使用项目内部轻量类型，保证 TypeScript 严格模式兼容。
 */

// ===================== 流程选项契约 =====================

/** 文档链接，用于在选项中指向相关帮助文档。 */
export type FlowDocsLink = {
  path: string;
  label?: string;
};

/** 流程贡献的来源类别，用于区分渠道、核心、Provider、搜索等表面。 */
export type FlowContributionKind = 'channel' | 'core' | 'provider' | 'search';

/** 流程贡献所属的交互表面。 */
export type FlowContributionSurface = 'auth-choice' | 'health' | 'model-picker' | 'setup';

/** 选项分组，便于在 UI 中聚合展示同类的选项。 */
export type FlowOptionGroup = {
  id: string;
  label: string;
  hint?: string;
};

/** 流程选项，统一描述 setup/model-picker/health 等表面可选的条目。 */
export type FlowOption<Value extends string = string> = {
  value: Value;
  label: string;
  hint?: string;
  group?: FlowOptionGroup;
  docs?: FlowDocsLink;
  assistantPriority?: number;
  assistantVisibility?: 'visible' | 'manual-only';
};

/** 通用贡献信封，被插件/核心 setup 表面复用。 */
export type FlowContribution<Value extends string = string> = {
  id: string;
  kind: FlowContributionKind;
  surface: FlowContributionSurface;
  option: FlowOption<Value>;
  source?: string;
};

/**
 * 按可见 label（其次 value）确定性排序流程贡献，便于 UI 稳定展示。
 */
export function sortFlowContributionsByLabel<T extends FlowContribution>(
  contributions: readonly T[],
): T[] {
  return [...contributions].sort(
    (left, right) =>
      left.option.label.localeCompare(right.option.label) ||
      left.option.value.localeCompare(right.option.value),
  );
}

// ===================== 健康检查类型 =====================

/** 健康检查发现（finding）的严重级别。 */
export type HealthFindingSeverity = 'info' | 'warning' | 'error';

/** 严重级别排序权重，数值越大越严重。 */
export const HEALTH_FINDING_SEVERITY_RANK: Record<HealthFindingSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
};

/** 将 CLI/配置输入解析为闭合的严重级别集合，无法识别时返回 null。 */
export function parseHealthFindingSeverity(
  input: string | undefined,
): HealthFindingSeverity | null {
  if (input === 'info' || input === 'warning' || input === 'error') {
    return input;
  }
  return null;
}

/** 判断某条 finding 是否达到配置的汇报阈值。 */
export function healthFindingMeetsSeverity(
  finding: Pick<HealthFinding, 'severity'>,
  severityMin: HealthFindingSeverity,
): boolean {
  return (
    HEALTH_FINDING_SEVERITY_RANK[finding.severity] >= HEALTH_FINDING_SEVERITY_RANK[severityMin]
  );
}

/** 健康检查产出的结构化 finding。 */
export interface HealthFinding {
  readonly checkId: string;
  readonly severity: HealthFindingSeverity;
  readonly message: string;
  readonly source?: string;
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;
  readonly ocPath?: string;
  readonly target?: string;
  readonly requirement?: string;
  readonly fixHint?: string;
}

/** 健康检查运行模式：doctor 诊断 / lint 校验 / fix 修复。 */
export type HealthCheckMode = 'doctor' | 'lint' | 'fix';

/**
 * 流程运行时环境的最小契约。
 * 仅声明健康检查与 setup 流程实际需要的字段，避免耦合到完整 RuntimeEnv。
 */
export interface FlowRuntimeEnv {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: string;
  readonly isDev?: boolean;
  exit?(code?: number): void;
}

/** 流程所读取的应用配置（以宽松记录形式承载，避免硬编码 schema）。 */
export type FlowConfig = Record<string, unknown>;

/** 传入健康检查 detect 阶段的不可变运行时/配置上下文。 */
export interface HealthCheckContext {
  readonly mode: HealthCheckMode;
  readonly runtime: FlowRuntimeEnv;
  readonly cfg: FlowConfig;
  readonly cwd?: string;
  readonly configPath?: string;
  readonly allowExecSecretRefs?: boolean;
}

/** 支持修复的健康检查上下文；修复可能产出 diff 或 dry-run 预览。 */
export interface HealthRepairContext extends Omit<HealthCheckContext, 'mode'> {
  readonly mode: 'fix';
  readonly dryRun?: boolean;
  readonly diff?: boolean;
}

/** 配置或文件修复输出的可选前后对比详情。 */
export interface HealthRepairDiff {
  readonly kind: 'config' | 'file';
  readonly path: string;
  readonly before?: string;
  readonly after?: string;
  readonly unifiedDiff?: string;
}

/** 修复副作用描述：涉及服务、进程、包或状态等。 */
export interface HealthRepairEffect {
  readonly kind: 'config' | 'file' | 'service' | 'process' | 'package' | 'state' | 'other';
  readonly action: string;
  readonly target?: string;
  readonly dryRunSafe?: boolean;
}

/** 修复函数返回的结果，描述修复状态、变更与可能的 diff/effect。 */
export interface HealthRepairResult {
  readonly status?: 'repaired' | 'skipped' | 'failed';
  readonly reason?: string;
  readonly config?: FlowConfig;
  readonly changes: readonly string[];
  readonly warnings?: readonly string[];
  readonly diffs?: readonly HealthRepairDiff[];
  readonly effects?: readonly HealthRepairEffect[];
}

/** 修复运行后基于已有 findings 收窄的校验范围。 */
export interface HealthCheckScope {
  readonly findings?: readonly HealthFinding[];
  readonly paths?: readonly string[];
  readonly ocPaths?: readonly string[];
}

/** 分离式 detect/repair 健康检查契约，由核心或插件注册。 */
export interface HealthCheck {
  readonly id: string;
  readonly kind: 'core' | 'plugin';
  readonly description: string;
  readonly source?: string;
  detect(ctx: HealthCheckContext, scope?: HealthCheckScope): Promise<readonly HealthFinding[]>;
  repair?(
    ctx: HealthRepairContext,
    findings: readonly HealthFinding[],
  ): Promise<HealthRepairResult>;
}

// ===================== 流程上下文与步骤 =====================

/** 流程运行时的上下文状态，在步骤间传递数据。 */
export interface FlowContext {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly platform: string;
  readonly isDev?: boolean;
  readonly config: FlowConfig;
  readonly configPath?: string;
  [key: string]: unknown;
}

/** 流程步骤的执行结果状态。 */
export type FlowStepStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed';

/** 单个流程步骤的定义。 */
export interface FlowStep<Ctx extends FlowContext = FlowContext, Result = unknown> {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly order?: number;
  readonly skipIf?: (ctx: Ctx) => boolean | Promise<boolean>;
  run(ctx: Ctx): Promise<FlowStepResult<Result>>;
}

/** 流程步骤的执行结果。 */
export interface FlowStepResult<Result = unknown> {
  readonly status: FlowStepStatus;
  readonly data?: Result;
  readonly error?: string;
  readonly warnings?: readonly string[];
  readonly nextStepId?: string;
}

/** 完整流程的运行结果。 */
export interface FlowResult<Ctx extends FlowContext = FlowContext> {
  readonly success: boolean;
  readonly context: Ctx;
  readonly steps: readonly FlowStepResult[];
  readonly totalSteps: number;
  readonly completedSteps: number;
  readonly failedSteps: number;
  readonly skippedSteps: number;
  readonly durationMs: number;
}

// ===================== 健康检查运行器类型 =====================

/** 健康检查运行时上下文，扩展自 HealthCheckContext，支持 repair/preview 模式。 */
export interface HealthCheckRunContext extends HealthCheckContext {
  readonly repair: boolean;
  readonly diff?: boolean;
  readonly previewRepair?: boolean;
}

/** 组合式健康检查结果（detect + repair 合并输出）。 */
export interface HealthCheckRunResult extends Omit<HealthRepairResult, 'changes' | 'status'> {
  readonly findings?: readonly HealthFinding[];
  readonly status?: 'repairable' | 'repaired' | 'skipped' | 'failed';
  readonly changes?: readonly string[];
  readonly diffs?: readonly HealthRepairDiff[];
  readonly effects?: readonly HealthRepairEffect[];
}

/** 自带 run() 方法的健康检查契约，自行编排 detect/repair 逻辑。 */
export interface RunnableHealthCheck
  extends Pick<HealthCheck, 'id' | 'kind' | 'description' | 'source'> {
  run(ctx: HealthCheckRunContext, scope?: HealthCheckScope): Promise<HealthCheckRunResult>;
}

/** 可输入的健康检查形态：分离式或自带 run。 */
export type HealthCheckInput = HealthCheck | RunnableHealthCheck;

/** 规范化后的健康检查契约，同时支持 detect/repair 和 run 两种调用方式。 */
export interface RegisteredHealthCheck extends HealthCheck {
  readonly sourceContract: 'split' | 'run';
  run(ctx: HealthCheckRunContext, scope?: HealthCheckScope): Promise<HealthCheckRunResult>;
}

// ===================== Doctor 流程类型 =====================

/** Doctor 诊断检查的分类。 */
export type DoctorCheckCategory = 'core' | 'provider' | 'channel' | 'search' | 'config' | 'security' | 'runtime';

/** Doctor 检查条目元数据。 */
export interface DoctorCheckMeta {
  readonly id: string;
  readonly category: DoctorCheckCategory;
  readonly description: string;
  readonly tags?: readonly string[];
}

/** Doctor lint 运行选项。 */
export interface DoctorLintRunOptions {
  readonly checks?: readonly HealthCheck[];
  readonly skipIds?: ReadonlySet<string> | readonly string[];
  readonly onlyIds?: ReadonlySet<string> | readonly string[];
}

/** Doctor lint 运行结果。 */
export interface DoctorLintRunResult {
  readonly findings: readonly HealthFinding[];
  readonly checksRun: number;
  readonly checksSkipped: number;
}

/** Doctor repair 运行选项。 */
export interface DoctorRepairRunOptions {
  readonly checks?: readonly HealthCheckInput[];
  readonly dryRun?: boolean;
  readonly diff?: boolean;
}

/** Doctor repair 运行结果。 */
export interface DoctorRepairRunResult {
  readonly config: FlowConfig;
  readonly findings: readonly HealthFinding[];
  readonly remainingFindings: readonly HealthFinding[];
  readonly changes: readonly string[];
  readonly warnings: readonly string[];
  readonly diffs: readonly HealthRepairDiff[];
  readonly effects: readonly HealthRepairEffect[];
  readonly checksRun: number;
  readonly checksRepaired: number;
  readonly checksValidated: number;
}
