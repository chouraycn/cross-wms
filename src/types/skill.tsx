/**
 * 统一技能模型 — React 入口
 * 
 * 从 skill-core.ts re-export 所有类型、接口和常量，
 * 并额外提供 ICON_MAP（React 组件映射，依赖 MUI 图标）。
 * 
 * 服务端请直接 import skill-core.ts 以避免 React 在 Node.js 环境下的警告。
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

// Re-export 所有核心类型和常量（无 React 依赖）
export {
  // 类型
  type SkillExecutionMode,
  type SkillCategory,
  type UsageStats,
  type ConflictResult,
  type SkillWatchEvent,
  type SkillSuggestionItem,
  type SkillDependency,
  type SkillPermission,
  type IntentCategory,
  type QuickExample,
  type Skill,
  type FailStrategy,
  type DataPassMode,
  type AuditLevel,
  type AuditTrigger,
  type ExecutionStatus,
  type StepStatus,
  type SkillChainNode,
  type SkillChain,
  type ChainExecutionStep,
  type SkillChainExecution,
  type SkillAudit,
  type AuditFinding,
  type SkillWithAudit,
  // 常量
  INTENT_CATEGORY_LABELS,
  INTENT_QUICK_EXAMPLES,
  AVAILABLE_ICON_NAMES,
  BUILTIN_SKILLS,
} from './skill-core';

// ===================== 图标映射（React 组件，仅前端使用） =====================

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
