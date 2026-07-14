/**
 * 统一技能模型 — 核心类型与数据（不含 React 依赖）
 * 
 * 从 skill.tsx 中提取，供服务端（Node.js 环境）和前端共用。
 * skill.tsx 从此文件 re-export 所有内容，并额外提供 ICON_MAP（React 组件映射）。
 */

// ===================== 类型定义 =====================

/** 技能执行模式 */
export type SkillExecutionMode =
  | 'navigate'    /** 导航到指定 path 页面 */
  | 'chat'        /** 注入 promptTemplate 到 AI 对话 */
  | 'automation'  /** 触发关联的自动化任务 */
  | 'hybrid';     /** chat + navigate/automation 组合 */

/** 技能分类 */
export type SkillCategory =
  | 'core'          /** 核心功能 */
  | 'data'          /** 数据管理 */
  | 'auto'          /** 自动化 */
  | 'tool'          /** 工具 */
  | 'communication' /** 通讯协作 */
  | 'document'      /** 文档处理 */
  | 'design'        /** 设计创作 */
  | 'development'   /** 开发工具 */
  | 'media'         /** 媒体处理 */
  | 'finance'       /** 财务分析 */
  | 'productivity'  /** 效率提升 */
  | 'ai-agent'      /** AI 智能体 */
  | string;         /** 允许自定义分类 */

/** 技能使用统计 */
export interface UsageStats {
  totalUses: number;
  lastUsedAt: string | null;
}

/** 冲突检测结果 */
export interface ConflictResult {
  skillId: string;
  skillName: string;
  score: number;
  reasons: string[];
}

/** 技能监听事件 */
export interface SkillWatchEvent {
  type: 'skill-added' | 'skill-changed' | 'skill-removed' | 'skill-audit-updated' | 'skill-install-progress';
  dirName?: string;
  name?: string;
  skillId?: string;
  level?: string;
  score?: number;
  timestamp: number;
  installId?: string;
  phase?: string;
  message?: string;
  percent?: number;
  error?: string;
}

/** 技能建议项 */
export interface SkillSuggestionItem {
  id: string;
  name: string;
  matchScore: number;
  reason: string;
}

/** 技能依赖 */
export interface SkillDependency {
  /** 依赖的技能 ID 或名称 */
  skillId: string;
  /** 依赖类型：required / optional / conflicts */
  type: 'required' | 'optional' | 'conflicts';
  /** 版本约束（如 ">=2.0"） */
  versionRange?: string;
}

/** 技能权限 */
export interface SkillPermission {
  /** 权限名称 */
  name: string;
  /** 权限描述 */
  description?: string;
  /** 是否为必须权限 */
  required?: boolean;
}

/** 意图分类（v1.7.0 新增） */
export type IntentCategory =
  | 'inventory_detail'
  | 'inbound_outbound_trend'
  | 'replenishment_analysis'
  | 'alert_summary'
  | 'prediction_analysis';

/** 意图分类中文映射 */
export const INTENT_CATEGORY_LABELS: Record<IntentCategory, string> = {
  inventory_detail: '库存明细',
  inbound_outbound_trend: '出入库趋势',
  replenishment_analysis: '补货分析',
  alert_summary: '预警摘要',
  prediction_analysis: '预测分析',
};

/** 意图分类快捷示例 */
export interface QuickExample {
  /** 示例文本 */
  text: string;
  /** 图标（MUI icon name） */
  icon: string;
}

/** 快捷示例映射（每个意图分类 3 个示例） */
export const INTENT_QUICK_EXAMPLES: Record<IntentCategory, QuickExample[]> = {
  inventory_detail: [
    { text: '哪个SKU库存最多？', icon: 'Inventory' },
    { text: '库龄超过90天的商品有哪些？', icon: 'Inventory' },
    { text: '各仓库的库存总价值？', icon: 'QueryStats' },
  ],
  inbound_outbound_trend: [
    { text: '最近7天的入库趋势', icon: 'Input' },
    { text: '本月出库量TOP10', icon: 'Output' },
    { text: '各仓库出入库对比', icon: 'BarChart' },
  ],
  replenishment_analysis: [
    { text: '哪些商品需要紧急补货？', icon: 'LocalShipping' },
    { text: '补货建议按优先级统计', icon: 'Assessment' },
    { text: '库存低于安全线的SKU', icon: 'Inventory' },
  ],
  alert_summary: [
    { text: '当前有哪些未解决的预警？', icon: 'WarningAmber' },
    { text: '各仓库的严重预警统计', icon: 'Analytics' },
    { text: '库龄预警商品清单', icon: 'Inventory' },
  ],
  prediction_analysis: [
    { text: '预测下月需要的库存量', icon: 'AutoMode' },
    { text: '哪些SKU的周转率在下降？', icon: 'Assessment' },
    { text: '未来一周的出入库预估', icon: 'Analytics' },
  ],
};

/** 统一技能类型 */
export interface Skill {
  id: string;
  name: string;
  desc: string;
  /** Material Icon 名称（如 'Dashboard', 'Warehouse' 等） */
  icon: string;
  category: SkillCategory;
  /** 子分类（可选） */
  subCategory?: string;
  path: string;
  /** 一句话说明触发/使用方式 */
  trigger?: string;
  /** 详细描述，用于详情面板 */
  detail?: string;
  /** 技能标签 */
  tags?: string[];
  /** 技能状态 */
  status: 'active' | 'available' | 'coming';
  /** 技能版本 */
  version?: string;
  /** 技能作者 */
  author?: string;
  /** 是否为推荐技能 */
  featured?: boolean;
  /** 关联的自动化任务类型 */
  automationTaskType?: string;
  /** 快捷方式说明 */
  shortcut?: string;
  /** 技能来源：内置 or 用户自定义 */
  source: 'builtin' | 'user';
  /** 用户安装时间（仅 source: 'user' 有值） */
  installedAt?: number;
  /** 技能执行模式（默认根据 promptTemplate/path/automationTaskType 自动推断） */
  executionMode?: SkillExecutionMode;
  /** AI 上下文模板：选择此技能后发送消息时，自动在用户消息前注入此 prompt 作为系统上下文 */
  promptTemplate?: string;
  /** 使用统计（可选） */
  usageStats?: UsageStats;
  /** 技能依赖列表（从 SKILL.md frontmatter 解析） */
  dependencies?: SkillDependency[];
  /** 技能权限声明（从 SKILL.md frontmatter 解析） */
  permissions?: SkillPermission[];
  /** 标准 SKILL.md 字段（从 SKILL.md 解析的原始标准字段快照） */
  standardFields?: {
    /** SKILL.md 中声明的版本号 */
    version?: string;
    /** SKILL.md 中声明的作者 */
    author?: string;
    /** SKILL.md 中声明的依赖 ID 列表 */
    dependencies?: string[];
    /** SKILL.md 中声明的权限名称列表 */
    permissions?: string[];
    /** SKILL.md 中提取的指令块内容 */
    instructionBlocks?: string[];
  };
  /** 技能市场远程 ID（来自市场的唯一标识） */
  remoteId?: string;
  /** 技能市场元数据（仅 marketplace 技能有值） */
  marketplaceMetadata?: {
    rating: number;
    downloadCount: number;
    latestVersion: string;
  };
  /** v1.7.0: 意图分类列表（仅 builtin-inventory-query 等自然语言查询技能有值） */
  intentCategories?: IntentCategory[];
  /** v1.7.0: 快捷示例列表（仅 builtin-inventory-query 等自然语言查询技能有值） */
  quickExamples?: QuickExample[];
}

// ===================== 图标名称列表（不含 React 组件） =====================

/** 可供用户选择的图标名称列表（用于"添加技能"表单） */
export const AVAILABLE_ICON_NAMES: string[] = [
  'Dashboard', 'Warehouse', 'LocalShipping', 'Inventory',
  'Description', 'BarChart', 'Assessment', 'Analytics',
  'Bolt', 'AutoMode', 'Chat', 'Tune', 'KeyboardCommandKey',
  'Input', 'Output', 'SmartToy', 'AutoFixHigh', 'Extension',
  'Functions', 'Code', 'Build', 'QueryStats', 'ManageSearch',
  'SettingsSuggest',
];

// ===================== 内置技能数据 =====================

// BUILTIN_SKILLS lives in a separate module so the initial bundle doesn't
// pay the cost of all skill data. Server-side consumers (`server/services/*`)
// and the legacy `import { BUILTIN_SKILLS }` paths keep working because we
// re-export the array directly (synchronous import). Frontend code should
// prefer the lazy `loadBuiltinSkills` API in `builtin-skills-loader.ts` to
// avoid loading the data into the initial bundle.
export { BUILTIN_SKILLS } from './builtin-skills';
export type { BuiltinSkillsData } from './builtin-skills';
export { getBuiltinSkillsSync, loadBuiltinSkills } from './builtin-skills-loader';

// ===================== 技能链类型 =====================

/** 失败策略 */
export type FailStrategy = 'stop' | 'skip' | 'retry';

/** 数据传递模式 */
export type DataPassMode = 'full' | 'fields' | 'custom';

/** 安全等级 */
export type AuditLevel = 'safe' | 'suspicious' | 'malicious';

/** 审计触发方式 */
export type AuditTrigger = 'import' | 'manual' | 'hot-reload';

/** 执行状态 */
export type ExecutionStatus = 'running' | 'success' | 'failed' | 'aborted';

/** 步骤状态 */
export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

/** 技能链节点 */
export interface SkillChainNode {
  id: string;
  skillId: string;
  skillName: string;
  skillIcon: string;
  dataPassMode: DataPassMode;
  selectedFields?: string[];
  customMapping?: Record<string, string>;
  timeout: number;
  retryCount: number;
  order: number;
}

/** 技能链 */
export interface SkillChain {
  id: string;
  name: string;
  description: string;
  nodes: SkillChainNode[];
  failStrategy: FailStrategy;
  createdAt: string;
  updatedAt: string;
}

/** 链执行步骤 */
export interface ChainExecutionStep {
  nodeId: string;
  skillId: string;
  skillName: string;
  status: StepStatus;
  input?: unknown;
  output?: unknown;
  duration?: number;
  error?: string;
}

/** 技能链执行记录 */
export interface SkillChainExecution {
  id: string;
  chainId: string;
  status: ExecutionStatus;
  failStrategy: FailStrategy;
  steps: ChainExecutionStep[];
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

/** 技能审计记录 */
export interface SkillAudit {
  id: string;
  skillId: string;
  skillVersion: string;
  score: number;
  level: AuditLevel;
  reportJson: string;
  reportMarkdown: string;
  triggeredBy: AuditTrigger;
  createdAt: string;
}

/** 审计发现项 */
export interface AuditFinding {
  severity: 'malicious' | 'suspicious' | 'informational';
  type: string;
  description: string;
  location?: string;
  pattern?: string;
}

// ===================== Skill Workshop 类型 =====================

/** 提案状态 */
export type WorkshopProposalStatus = 'pending' | 'applied' | 'rejected' | 'quarantined' | 'stale';

/** 提案类型 */
export type WorkshopProposalType = 'create' | 'update';

/** 提案扫描结果 */
export interface WorkshopProposalScan {
  critical: number;
  warn: number;
  info: number;
  findings: Array<{ level: string; type: string; description: string }>;
}

/** 技能提案 */
export interface WorkshopProposal {
  id: string;
  type: WorkshopProposalType;
  skillName: string;
  skillPath: string;
  content: string;
  contentHash: string;
  status: WorkshopProposalStatus;
  scan: WorkshopProposalScan;
  createdAt: number;
  updatedAt: number;
  appliedAt?: number;
  rejectedAt?: number;
  reviewNote?: string;
}

/** 提案统计 */
export interface WorkshopStats {
  total: number;
  pending: number;
  applied: number;
  rejected: number;
  quarantined: number;
  stale: number;
}

/** 安装进度 */
export interface SkillInstallProgress {
  type: 'start' | 'download' | 'extract' | 'scan' | 'register' | 'complete' | 'error';
  stage: string;
  message?: string;
  progress?: number;
}

/** 安装规格 */
export interface SkillInstallSpec {
  source: 'local' | 'git' | 'archive' | 'market' | 'http';
  url?: string;
  path?: string;
  name?: string;
  version?: string;
}

// ===================== Skill 接口扩展 =====================

/** 安全等级（可选字段，扩展自 Skill 接口） */
export interface SkillWithAudit extends Skill {
  auditLevel?: AuditLevel | null;
  auditScore?: number | null;
}
