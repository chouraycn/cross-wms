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
  type: 'skill-added' | 'skill-changed' | 'skill-removed';
  dirName: string;
  name: string;
  timestamp: number;
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

export const BUILTIN_SKILLS: Skill[] = [
  // ---- 核心功能 (core) ----
  {
    id: 'builtin-dashboard',
    name: '仪表盘总览',
    desc: 'KPI 监控、仓库热力图、趋势分析与全局概览',
    icon: 'Dashboard',
    category: 'core',
    path: '/',
    trigger: '打开仪表盘 / 查看概览',
    detail: '实时展示所有仓库的核心指标，包括入库/出库/在途数量、容积率热力图、趋势曲线。支持仓库筛选与多维度切换。',
    tags: ['概览', 'KPI'],
    status: 'active',
    version: '1.0',
    featured: true,
    source: 'builtin',
    executionMode: 'chat',
    promptTemplate: '你是 CDF Know Clow 仪表盘分析助手。用户正在查看仓库仪表盘，你需要帮助用户解读 KPI 数据、分析趋势、对比仓库表现。你可以：1）解释各指标含义与异常波动；2）建议关注哪些关键指标变化；3）对比不同仓库的入库/出库/在途/容积率数据；4）根据热力图趋势给出仓储优化建议。请用简洁专业的语言回答，涉及数据时优先给出具体数值。',
  },
  {
    id: 'builtin-warehouse',
    name: '仓库管理',
    desc: '仓储规划、库位优化、库存调配与多仓切换',
    icon: 'Warehouse',
    category: 'core',
    path: '/warehouses',
    trigger: '管理仓库 / 添加仓库',
    detail: '支持多仓库切换、库位规划与优化、库存调拨与调配。提供仓库基础信息管理、库位热力图与容积率监控。',
    tags: ['核心', '仓库'],
    status: 'active',
    version: '1.0',
    featured: true,
    source: 'builtin',
    executionMode: 'hybrid',
    promptTemplate: '你是 CDF Know Clow 仓库管理助手。用户正在管理跨境仓库，你需要帮助用户：1）规划仓库库位布局与容量分配；2）分析各仓库容积率与件数使用情况；3）制定库存调拨与多仓调配方案；4）优化仓储运营效率。注意区分仓库类型（保税仓/海外仓/直邮仓），考虑跨境合规要求。给出可操作的建议时附带预期效果。',
  },
  {
    id: 'builtin-transit',
    name: '在途跟踪',
    desc: '物流追踪、时效分析、异常预警与交期预测',
    icon: 'LocalShipping',
    category: 'core',
    path: '/in-transit',
    trigger: '追踪物流 / 在途查询',
    detail: '实时追踪在途物流，提供时效分析、异常预警与交期预测。支持按仓库/运输方式/状态筛选，快速定位异常运单。',
    tags: ['物流', '追踪'],
    status: 'active',
    version: '1.0',
    featured: true,
    source: 'builtin',
    executionMode: 'hybrid',
    promptTemplate: '你是 CDF Know Clow 在途物流跟踪助手。你需要帮助用户：1）追踪在途运单状态与预计到达时间；2）分析物流时效与延误原因；3）预警异常运单（超时/滞留/清关异常）；4）预测交期并建议应对方案。重点关注跨境物流节点：报关、清关、转关、尾程配送。对于异常情况，给出具体的处理步骤和负责人建议。',
  },
  {
    id: 'builtin-inventory',
    name: '库存管理',
    desc: '库龄预警、滞销处理、周转优化与保质期管理',
    icon: 'Inventory',
    category: 'core',
    path: '/inventory',
    trigger: '查看库存 / 库龄分析',
    detail: '库龄预警与滞销品处理，周转率优化建议，保质期临期提醒。支持按仓库/品类/库龄段筛选分析。',
    tags: ['库存', '预警'],
    status: 'active',
    version: '1.0',
    source: 'builtin',
    executionMode: 'hybrid',
    promptTemplate: '你是 CDF Know Clow 库存管理助手。你需要帮助用户：1）分析库存结构与库龄分布，识别滞销品；2）设置库龄预警阈值与保质期提醒规则；3）优化库存周转率，建议安全库存水平；4）制定滞销品处理方案（促销/调拨/退仓）。考虑跨境仓库的特殊性：多仓分布、跨境调拨周期、清关时效对库存的影响。',
  },
  {
    id: 'builtin-inbound',
    name: '入库规划',
    desc: '优化入库流程，提升仓库入库效率',
    icon: 'Input',
    category: 'core',
    path: '/',
    trigger: '入库规划 / 安排入库',
    detail: '智能规划入库流程，根据仓库容积率与库位分布推荐最优入库方案，提升入库效率与准确率。',
    tags: ['入库', '规划'],
    status: 'active',
    version: '1.0',
    source: 'builtin',
    executionMode: 'chat',
    promptTemplate: '你是 CDF Know Clow 入库规划助手。你需要帮助用户：1）根据仓库当前容积率推荐最佳入库仓库与时间窗口；2）规划入库批次与库位分配方案；3）预估入库耗时与所需人力；4）优化入库流程减少等待与错误率。关注跨境入库的特殊环节：到港卸货、报关入库、质检上架。给出方案时附带时间线和资源需求。',
  },
  {
    id: 'builtin-outbound',
    name: '出库优化',
    desc: '优化出库流程，降低出库错误率',
    icon: 'Output',
    category: 'core',
    path: '/',
    trigger: '出库优化 / 出库调度',
    detail: '基于订单优先级、仓库库位分布与物流时效，智能优化出库路径与策略，降低出库错误率与时效。',
    tags: ['出库', '优化'],
    status: 'active',
    version: '1.0',
    source: 'builtin',
    executionMode: 'chat',
    promptTemplate: '你是 CDF Know Clow 出库优化助手。你需要帮助用户：1）根据订单优先级与物流时效制定出库排程；2）优化拣货路径减少行走距离与时间；3）分析出库错误率原因并给出改进措施；4）处理紧急出库与批量出库的优先级冲突。关注跨境出库环节：订单审核、打包规范、报关申报、物流交接。建议附带预期效率提升指标。',
  },
  // ---- 数据管理 (data) ----
  {
    id: 'builtin-tencent-docs',
    name: '腾讯文档',
    desc: '在线文档管理、API 授权、数据同步与自动更新',
    icon: 'Description',
    category: 'data',
    path: '/tencent-docs',
    trigger: '同步文档 / 文档设置',
    detail: '对接腾讯文档 API，实现在线文档管理、数据双向同步与自动更新。支持配置文档映射、定时同步与手动触发。',
    tags: ['文档', '同步'],
    automationTaskType: 'data-sync',
    status: 'active',
    version: '1.0',
    featured: true,
    source: 'builtin',
    executionMode: 'hybrid',
    promptTemplate: '你是 CDF Know Clow 腾讯文档同步助手。你需要帮助用户：1）配置腾讯文档 API 授权与文档映射关系；2）设置定时同步策略与手动触发同步；3）排查同步失败原因与数据不一致问题；4）建议最优的文档组织方式与数据映射方案。了解支持的文档类型：在线表格、智能文档。提醒用户注意 API 调用频率限制与权限设置。',
  },
  {
    id: 'builtin-reports',
    name: '统计报表',
    desc: '自定义报表、数据导出、CSV 导出与定期生成',
    icon: 'BarChart',
    category: 'data',
    path: '/reports',
    trigger: '生成报表 / 导出数据',
    detail: '支持自定义报表模板，数据按需导出为 CSV 格式。可配置定期自动生成，关联自动化调度任务。',
    tags: ['报表', '导出'],
    automationTaskType: 'report-gen',
    status: 'active',
    version: '1.0',
    source: 'builtin',
    executionMode: 'hybrid',
    promptTemplate: '你是 CDF Know Clow 报表生成助手。你需要帮助用户：1）设计自定义报表模板与指标组合；2）导出数据为 CSV 格式并解释字段含义；3）配置定期自动生成报表的调度规则；4）解读报表数据并给出业务洞察。支持维度：仓库/品类/时间段/物流方式。报表类型：库存报表、出入库报表、在途报表、KPI 综合报表。',
  },
  {
    id: 'builtin-volume',
    name: '容积率优化',
    desc: '容积计算、预警设置、满仓方案与件数上限分析',
    icon: 'Assessment',
    category: 'data',
    path: '/',
    trigger: '容积率 / 预警设置',
    detail: '实时监控仓库容积率，超过阈值自动生成预警。支持满仓方案推荐与件数上限分析，关联自动化预警任务。',
    tags: ['仓库', '优化'],
    automationTaskType: 'volume-alert',
    status: 'active',
    version: '1.0',
    source: 'builtin',
    executionMode: 'hybrid',
    promptTemplate: '你是 CDF Know Clow 容积率优化助手。你需要帮助用户：1）计算各仓库当前容积率与件数使用率；2）设置容积率预警阈值与通知方式；3）当仓库接近满仓时推荐扩容或调拨方案；4）分析容积率趋势预测未来仓储需求。关键指标：容积率(已用件数/件数上限)、日均出入库量、预计满仓时间。给出方案时附带成本与时效评估。',
  },
  {
    id: 'builtin-data-analysis',
    name: '数据分析',
    desc: '趋势预测、异常检测、决策建议与智能洞察',
    icon: 'Analytics',
    category: 'data',
    path: '/',
    trigger: '数据分析 / 趋势预测',
    detail: '基于历史数据的趋势预测与异常检测，提供库存/物流/仓储维度的智能洞察与决策建议。',
    tags: ['分析', '智能'],
    status: 'available',
    version: '0.9',
    source: 'builtin',
    executionMode: 'chat',
    promptTemplate: '你是 CDF Know Clow 数据分析助手，擅长从跨境仓储数据中挖掘洞察。你需要帮助用户：1）分析库存/在途/出入库数据趋势，识别异常波动；2）预测未来7-30天的仓储需求与物流量；3）对比不同时间段、仓库、品类的关键指标差异；4）给出数据驱动的运营优化建议。分析方法：同比/环比分析、异常值检测、趋势外推、关联性分析。输出格式：先给结论，再给数据支撑，最后给建议。',
  },
  {
    id: 'builtin-warehouse-kpi',
    name: '仓库KPI',
    desc: '查看仓库关键绩效指标和趋势',
    icon: 'QueryStats',
    category: 'data',
    path: '/',
    trigger: '仓库KPI / 绩效查看',
    detail: '查看仓库关键绩效指标，包括出入库效率、准确率、时效达标率等，支持趋势对比与目标追踪。',
    tags: ['KPI', '绩效'],
    status: 'active',
    version: '1.0',
    source: 'builtin',
    executionMode: 'chat',
    promptTemplate: '你是 CDF Know Clow 仓库 KPI 分析助手。你需要帮助用户：1）解读各仓库关键绩效指标：出入库效率、准确率、时效达标率、库存周转率；2）对比不同仓库的 KPI 表现并排名；3）追踪 KPI 目标达成进度；4）分析 KPI 异常原因并给出改进建议。KPI 体系：运营效率类（出入库单量/时效）、质量类（差错率/客诉率）、成本类（单件仓储成本）。输出时用表格或排名形式清晰呈现。',
  },
  // ---- 自动化 (auto) ----
  {
    id: 'builtin-automation',
    name: '自动化调度',
    desc: '周期执行、一次性任务、有效期管理与执行历史',
    icon: 'Bolt',
    category: 'auto',
    path: '/automation',
    trigger: '创建自动化 / 调度任务',
    detail: '管理自动化调度任务，支持周期执行（每小时/每天/每周/每月）、一次性执行、动作链组合与有效期控制。查看执行历史、重试失败任务。',
    tags: ['自动化', '调度'],
    status: 'active',
    version: '1.0',
    featured: true,
    source: 'builtin',
    executionMode: 'hybrid',
    promptTemplate: '你是 CDF Know Clow 自动化调度助手。你需要帮助用户：1）创建和配置自动化任务（周期/一次性/动作链）；2）设置任务有效期与执行频率；3）排查任务执行失败原因并建议修复方案；4）优化任务调度避免资源冲突。支持的任务类型：数据同步(data-sync)、库存快照(inventory-snapshot)、报表生成(report-gen)、容积率预警(volume-alert)、自定义(custom)。动作链支持串行组合多个 Action。',
  },
  {
    id: 'builtin-inventory-snapshot',
    name: '库存快照',
    desc: '定时采集库存快照，追踪库存变化与趋势',
    icon: 'AutoMode',
    category: 'auto',
    path: '/automation',
    trigger: '库存快照 / 拍照',
    detail: '按计划定时采集各仓库库存快照，记录SKU数量与库位变化。支持快照对比与历史趋势分析。',
    tags: ['快照', '自动化'],
    automationTaskType: 'inventory-snapshot',
    status: 'active',
    version: '1.0',
    source: 'builtin',
    executionMode: 'hybrid',
    promptTemplate: '你是 CDF Know Clow 库存快照助手。你需要帮助用户：1）配置库存快照采集频率与范围；2）对比不同时间点的库存快照，识别变动项；3）分析库存变化趋势（增长/减少/周转加速）；4）设置库存异常变动预警规则。快照维度：按仓库、按SKU、按库位、按库龄段。对比方式：环比（与上次快照）、同比（与上月同期）。输出时突出关键变动项和异常值。',
  },
  // ---- 工具 (tool) ----
  {
    id: 'builtin-agent',
    name: '智能助手',
    desc: 'AI 对话、数据查询、操作指引与自然语言交互',
    icon: 'Chat',
    category: 'tool',
    path: '/chat',
    trigger: '提问 / AI 助手',
    detail: '通过底部 AI 对话框进行自然语言交互，支持数据查询、操作指引、报表解读等场景。在任何页面均可唤起。',
    tags: ['AI', '对话'],
    status: 'active',
    version: '1.0',
    source: 'builtin',
    executionMode: 'chat',
    promptTemplate: '你是 CDF Know Clow 智能助手，一个跨境仓储管理系统的 AI 助理。你可以帮助用户：1）查询和解读仓库数据（库存/在途/出入库/KPI）；2）提供操作指引（如何添加仓库、配置同步、设置自动化等）；3）解答跨境仓储相关问题（报关流程、合规要求、多仓协同）；4）生成报表和数据分析。回答时保持简洁专业，涉及数据时给出具体数值，建议时附带操作步骤。',
  },
  {
    id: 'builtin-metrics',
    name: '指标控制',
    desc: '仪表盘参数调整、模块显隐、热力图与数据源配置',
    icon: 'Tune',
    category: 'tool',
    path: '/',
    shortcut: '设置 > 指标控制',
    trigger: '设置 > 指标控制',
    detail: '调整仪表盘显示参数，控制模块显隐，配置热力图参数与数据源模式（Mock/API/腾讯文档）。',
    tags: ['设置', '仪表盘'],
    status: 'active',
    version: '1.0',
    source: 'builtin',
    executionMode: 'chat',
    promptTemplate: '你是 CDF Know Clow 指标配置助手。你需要帮助用户：1）调整仪表盘显示参数与模块显隐；2）配置热力图指标（入库量/出库量/在途量/容积率）与时间范围；3）设置数据源模式（Mock/API/腾讯文档）与连接参数；4）优化仪表盘布局以匹配业务关注点。可配置模块：KPI 卡片、趋势图、热力图、仓库概览。提醒用户修改后需保存设置。',
  },
  {
    id: 'builtin-shortcut',
    name: '快捷指令',
    desc: '快速执行常用操作、导航跳转与批量处理',
    icon: 'KeyboardCommandKey',
    category: 'tool',
    path: '/chat',
    trigger: '输入 / 触发指令',
    detail: '通过 "/" 前缀快速触发预定义指令，如 /sync 触发同步、/report 生成报表、/alert 查看预警。可在 AI 对话框中直接使用。',
    tags: ['快捷', '指令'],
    status: 'available',
    version: '0.9',
    source: 'builtin',
    executionMode: 'chat',
    promptTemplate: '你是 CDF Know Clow 快捷指令助手。用户通过 "/" 前缀触发指令，你需要帮助用户：1）解释可用的快捷指令及其功能；2）执行指令对应的操作（如 /sync 同步数据、/report 生成报表、/alert 查看预警）；3）创建自定义快捷指令；4）批量执行组合指令。可用指令：/sync（数据同步）、/report（报表生成）、/alert（预警查看）、/snapshot（库存快照）、/dashboard（仪表盘）、/warehouse（仓库管理）、/inventory（库存查看）、/transit（在途查询）。',
  },
  // ---- 数据查询 (data) ----
  {
    id: 'builtin-inventory-query',
    name: '库存查询',
    desc: '自然语言查询库存数据，自动生成 SQL 并以图表/表格展示结果',
    icon: 'QueryStats',
    category: 'data',
    path: '/',
    trigger: '查询库存 / 库存数据 / 库存统计',
    detail: '通过自然语言查询库存数据，AI 自动生成安全 SQL 查询，结果以表格或图表（柱状/折线/饼图）展示。支持出库排名、低库存预警、趋势分析等场景。',
    tags: ['库存', '查询', '数据'],
    status: 'active',
    version: '1.7.0',
    featured: false,
    source: 'builtin',
    executionMode: 'chat',
    promptTemplate: '',  // 运行时由服务端 skillWatcher 热重载注入 INVENTORY_QUERY_PROMPT
    intentCategories: [
      'inventory_detail',
      'inbound_outbound_trend',
      'replenishment_analysis',
      'alert_summary',
      'prediction_analysis',
    ],
    quickExamples: [
      { text: '哪个SKU库存最多？', icon: 'Inventory' },
      { text: '最近7天的入库趋势', icon: 'Input' },
      { text: '哪些商品需要紧急补货？', icon: 'LocalShipping' },
      { text: '当前有哪些未解决的预警？', icon: 'WarningAmber' },
      { text: '预测下月需要的库存量', icon: 'AutoMode' },
    ],
  },
];

// ===================== 技能链类型 =====================

/** 失败策略 */
export type FailStrategy = 'stop' | 'skip';

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

// ===================== Skill 接口扩展 =====================

/** 安全等级（可选字段，扩展自 Skill 接口） */
export interface SkillWithAudit extends Skill {
  auditLevel?: AuditLevel | null;
  auditScore?: number | null;
}
