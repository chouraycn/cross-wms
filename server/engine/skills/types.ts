export type SkillSource = "bundled" | "workspace" | "unknown";

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

export type SkillMetadata = {
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
