/**
 * 统一技能模型
 * 合并 SkillsPage 与 AI Chat SkillSelector 两套独立类型为单一模型
 */

import React from 'react';
import DashboardIcon from '@mui/icons-material/Dashboard';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InventoryIcon from '@mui/icons-material/Inventory';
import DescriptionIcon from '@mui/icons-material/Description';
import BarChartIcon from '@mui/icons-material/BarChart';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import BoltIcon from '@mui/icons-material/Bolt';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import ChatIcon from '@mui/icons-material/Chat';
import TuneIcon from '@mui/icons-material/Tune';
import KeyboardCommandKeyIcon from '@mui/icons-material/KeyboardCommandKey';
import InputIcon from '@mui/icons-material/Input';
import OutputIcon from '@mui/icons-material/Output';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ExtensionIcon from '@mui/icons-material/Extension';
import FunctionsIcon from '@mui/icons-material/Functions';
import CodeIcon from '@mui/icons-material/Code';
import BuildIcon from '@mui/icons-material/Build';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';

// ===================== 类型定义 =====================

/** 统一技能类型 */
export interface Skill {
  id: string;
  name: string;
  desc: string;
  /** Material Icon 名称（如 'Dashboard', 'Warehouse' 等） */
  icon: string;
  category: 'core' | 'data' | 'auto' | 'tool';
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
}

// ===================== 图标映射 =====================

/** 根据 icon 字符串名渲染 React 组件 */
export const ICON_MAP: Record<string, React.ReactNode> = {
  'Dashboard': <DashboardIcon sx={{ fontSize: 22 }} />,
  'Warehouse': <WarehouseIcon sx={{ fontSize: 22 }} />,
  'LocalShipping': <LocalShippingIcon sx={{ fontSize: 22 }} />,
  'Inventory': <InventoryIcon sx={{ fontSize: 22 }} />,
  'Description': <DescriptionIcon sx={{ fontSize: 22 }} />,
  'BarChart': <BarChartIcon sx={{ fontSize: 22 }} />,
  'Assessment': <AssessmentIcon sx={{ fontSize: 22 }} />,
  'Analytics': <AnalyticsIcon sx={{ fontSize: 22 }} />,
  'Bolt': <BoltIcon sx={{ fontSize: 22 }} />,
  'AutoMode': <AutoModeIcon sx={{ fontSize: 22 }} />,
  'Chat': <ChatIcon sx={{ fontSize: 22 }} />,
  'Tune': <TuneIcon sx={{ fontSize: 22 }} />,
  'KeyboardCommandKey': <KeyboardCommandKeyIcon sx={{ fontSize: 22 }} />,
  'Input': <InputIcon sx={{ fontSize: 22 }} />,
  'Output': <OutputIcon sx={{ fontSize: 22 }} />,
  'SmartToy': <SmartToyIcon sx={{ fontSize: 22 }} />,
  'AutoFixHigh': <AutoFixHighIcon sx={{ fontSize: 22 }} />,
  'Extension': <ExtensionIcon sx={{ fontSize: 22 }} />,
  'Functions': <FunctionsIcon sx={{ fontSize: 22 }} />,
  'Code': <CodeIcon sx={{ fontSize: 22 }} />,
  'Build': <BuildIcon sx={{ fontSize: 22 }} />,
  'QueryStats': <QueryStatsIcon sx={{ fontSize: 22 }} />,
  'ManageSearch': <ManageSearchIcon sx={{ fontSize: 22 }} />,
  'SettingsSuggest': <SettingsSuggestIcon sx={{ fontSize: 22 }} />,
};

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
  },
  // ---- 工具 (tool) ----
  {
    id: 'builtin-agent',
    name: '智能助手',
    desc: 'AI 对话、数据查询、操作指引与自然语言交互',
    icon: 'Chat',
    category: 'tool',
    path: '/agent',
    trigger: '提问 / AI 助手',
    detail: '通过底部 AI 对话框进行自然语言交互，支持数据查询、操作指引、报表解读等场景。在任何页面均可唤起。',
    tags: ['AI', '对话'],
    status: 'active',
    version: '1.0',
    source: 'builtin',
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
  },
  {
    id: 'builtin-shortcut',
    name: '快捷指令',
    desc: '快速执行常用操作、导航跳转与批量处理',
    icon: 'KeyboardCommandKey',
    category: 'tool',
    path: '/agent',
    trigger: '输入 / 触发指令',
    detail: '通过 "/" 前缀快速触发预定义指令，如 /sync 触发同步、/report 生成报表、/alert 查看预警。可在 AI 对话框中直接使用。',
    tags: ['快捷', '指令'],
    status: 'available',
    version: '0.9',
    source: 'builtin',
  },
];
