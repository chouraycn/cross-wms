import type { SourceInfo } from "../agents/sessions/source-info.js";

export type SkillSource = "bundled" | "workspace" | "managed" | "unknown";

/** 技能遥测来源（用于指标上报，归一化为有限集合）。 */
export type SkillTelemetrySource = "bundled" | "workspace" | "unknown";

export type SkillInstallSpec = {
  id?: string;
  kind: "brew" | "node" | "go" | "uv" | "download";
  label?: string;
  bins?: string[];
  os?: string[];
  formula?: string;
  package?: string;
  module?: string;
  url?: string;
  archive?: string;
  extract?: boolean;
  stripComponents?: number;
  targetDir?: string;
};

/**
 * OpenClaw 上游技能元数据结构（不含 server 扩展的 disabled/disableModelInvocation 字段）。
 * 由 resolveOpenClawMetadata 产出，供 workspace.ts 等上游对齐代码使用。
 */
export type OpenClawSkillMetadata = {
  always?: boolean;
  skillKey?: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  os?: string[];
  requires?: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
  };
  install?: SkillInstallSpec[];
};

export type SkillMetadata = {
  always?: boolean;
  skillKey?: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  os?: string[];
  disabled?: boolean;
  disableModelInvocation?: boolean;
  requires?: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
  };
  install?: SkillInstallSpec[];
};

export type SkillInvocationPolicy = {
  userInvocable: boolean;
  disableModelInvocation: boolean;
};

export type SkillCommandDispatchSpec = {
  kind: "tool";
  toolName: string;
  argMode?: "raw";
};

export type SkillCommandSpec = {
  name: string;
  skillName: string;
  description: string;
  skillSource?: SkillSource;
  descriptionLocalizations?: Record<string, string>;
  dispatch?: SkillCommandDispatchSpec;
  promptTemplate?: string;
  sourceFilePath?: string;
};

export type SkillsInstallPreferences = {
  preferBrew: boolean;
  nodeManager: "npm" | "pnpm" | "yarn" | "bun";
};

export type ParsedSkillFrontmatter = Record<string, string>;

export type SkillExposure = {
  includeInRuntimeRegistry: boolean;
  includeInAvailableSkillsPrompt: boolean;
  userInvocable: boolean;
};

export interface Skill {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  promptVersion?: string;
  /** 来源元信息（上游 skill-contract 要求必填；server 旧代码可能缺失，标可选以兼容）。 */
  sourceInfo?: SourceInfo;
  source: SkillSource;
  disableModelInvocation: boolean;
}

export type SkillEntry = {
  skill: Skill;
  frontmatter: ParsedSkillFrontmatter;
  metadata?: SkillMetadata;
  invocation?: SkillInvocationPolicy;
  exposure?: SkillExposure;
  syncSourceDir?: string;
  syncDirName?: string;
};

export type SkillEligibilityContext = {
  remote?: {
    platforms: string[];
    hasBin: (bin: string) => boolean;
    hasAnyBin: (bins: string[]) => boolean;
    note?: string;
  };
};

export const WORKSPACE_SKILLS_PROMPT_FORMAT_VERSION = 1;

export type SkillSnapshot = {
  prompt: string;
  skills: Array<{ name: string; primaryEnv?: string; requiredEnv?: string[] }>;
  skillFilter?: string[];
  resolvedSkills?: Skill[];
  version?: number;
  promptFormatVersion?: number;
};

// ============================================================================
// 技能依赖与冲突管理
// ============================================================================

/** 技能依赖声明 */
export type SkillDependency = {
  /** 依赖的技能名称 */
  skill: string;
  /** 版本约束（可选） */
  version?: string;
  /** 是否必需（false 表示可选依赖） */
  required?: boolean;
  /** 依赖原因说明 */
  reason?: string;
};

/** 技能冲突声明 */
export type SkillConflict = {
  /** 冲突的技能名称 */
  skill: string;
  /** 冲突原因 */
  reason: string;
  /** 建议的解决方案 */
  suggestion?: string;
};

/** 技能依赖图节点 */
export type SkillDependencyNode = {
  skill: SkillEntry;
  dependencies: SkillDependencyNode[];
  dependents: SkillDependencyNode[];
  depth: number;
};

/** 依赖检查结果 */
export type DependencyCheckResult = {
  /** 是否通过检查 */
  valid: boolean;
  /** 缺失的必需依赖 */
  missing: SkillDependency[];
  /** 检测到的冲突 */
  conflicts: SkillConflict[];
  /** 可选依赖未满足（仅警告） */
  optionalMissing: SkillDependency[];
  /** 依赖循环 */
  cycles: string[][];
};

/** 技能依赖配置（从 metadata 解析） */
export type SkillDependencyConfig = {
  dependsOn?: SkillDependency[];
  conflictsWith?: SkillConflict[];
};
