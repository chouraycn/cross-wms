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
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SyncIcon from '@mui/icons-material/Sync';
import RouteIcon from '@mui/icons-material/Route';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PsychologyIcon from '@mui/icons-material/Psychology';
import HubIcon from '@mui/icons-material/Hub';
import MemoryIcon from '@mui/icons-material/Memory';
import TerminalIcon from '@mui/icons-material/Terminal';
import BugReportIcon from '@mui/icons-material/BugReport';
import SecurityIcon from '@mui/icons-material/Security';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CalculateIcon from '@mui/icons-material/Calculate';
import ArticleIcon from '@mui/icons-material/Article';
import ImageIcon from '@mui/icons-material/Image';
import PaletteIcon from '@mui/icons-material/Palette';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import VideocamIcon from '@mui/icons-material/Videocam';
import EmailIcon from '@mui/icons-material/Email';
import ForumIcon from '@mui/icons-material/Forum';
import PhoneIcon from '@mui/icons-material/Phone';
import WebhookIcon from '@mui/icons-material/Webhook';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import FactoryIcon from '@mui/icons-material/Factory';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import ChecklistIcon from '@mui/icons-material/Checklist';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import QrCodeIcon from '@mui/icons-material/QrCode';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import PercentIcon from '@mui/icons-material/Percent';
import SavingsIcon from '@mui/icons-material/Savings';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';

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
} from './skill-core';
export { getBuiltinSkillsSync, loadBuiltinSkills, BUILTIN_SKILLS } from './skill-core';

// ===================== 图标映射（React 组件，仅前端使用） =====================

/** 根据 icon 字符串名渲染 React 组件 */
export const ICON_MAP: Record<string, React.ReactNode> = {
  // 核心仓储
  'Dashboard': <DashboardIcon sx={{ fontSize: 22 }} />,
  'Warehouse': <WarehouseIcon sx={{ fontSize: 22 }} />,
  'LocalShipping': <LocalShippingIcon sx={{ fontSize: 22 }} />,
  'Inventory': <InventoryIcon sx={{ fontSize: 22 }} />,
  'Input': <InputIcon sx={{ fontSize: 22 }} />,
  'Output': <OutputIcon sx={{ fontSize: 22 }} />,
  'Factory': <FactoryIcon sx={{ fontSize: 22 }} />,
  'PrecisionManufacturing': <PrecisionManufacturingIcon sx={{ fontSize: 22 }} />,
  'Checklist': <ChecklistIcon sx={{ fontSize: 22 }} />,
  'FactCheck': <FactCheckIcon sx={{ fontSize: 22 }} />,
  'QrCode': <QrCodeIcon sx={{ fontSize: 22 }} />,
  'Route': <RouteIcon sx={{ fontSize: 22 }} />,
  // 数据与报表
  'Description': <DescriptionIcon sx={{ fontSize: 22 }} />,
  'Article': <ArticleIcon sx={{ fontSize: 22 }} />,
  'BarChart': <BarChartIcon sx={{ fontSize: 22 }} />,
  'Assessment': <AssessmentIcon sx={{ fontSize: 22 }} />,
  'Analytics': <AnalyticsIcon sx={{ fontSize: 22 }} />,
  'QueryStats': <QueryStatsIcon sx={{ fontSize: 22 }} />,
  'ManageSearch': <ManageSearchIcon sx={{ fontSize: 22 }} />,
  'TrendingUp': <TrendingUpIcon sx={{ fontSize: 22 }} />,
  'ReceiptLong': <ReceiptLongIcon sx={{ fontSize: 22 }} />,
  // 自动化与调度
  'Bolt': <BoltIcon sx={{ fontSize: 22 }} />,
  'AutoMode': <AutoModeIcon sx={{ fontSize: 22 }} />,
  'Schedule': <ScheduleIcon sx={{ fontSize: 22 }} />,
  'Sync': <SyncIcon sx={{ fontSize: 22 }} />,
  'NotificationsActive': <NotificationsActiveIcon sx={{ fontSize: 22 }} />,
  // 工具与配置
  'Chat': <ChatIcon sx={{ fontSize: 22 }} />,
  'Forum': <ForumIcon sx={{ fontSize: 22 }} />,
  'Tune': <TuneIcon sx={{ fontSize: 22 }} />,
  'SettingsSuggest': <SettingsSuggestIcon sx={{ fontSize: 22 }} />,
  'KeyboardCommandKey': <KeyboardCommandKeyIcon sx={{ fontSize: 22 }} />,
  'SmartToy': <SmartToyIcon sx={{ fontSize: 22 }} />,
  'Psychology': <PsychologyIcon sx={{ fontSize: 22 }} />,
  'AutoFixHigh': <AutoFixHighIcon sx={{ fontSize: 22 }} />,
  'Extension': <ExtensionIcon sx={{ fontSize: 22 }} />,
  'Build': <BuildIcon sx={{ fontSize: 22 }} />,
  'Functions': <FunctionsIcon sx={{ fontSize: 22 }} />,
  'Code': <CodeIcon sx={{ fontSize: 22 }} />,
  'Terminal': <TerminalIcon sx={{ fontSize: 22 }} />,
  'Memory': <MemoryIcon sx={{ fontSize: 22 }} />,
  'Hub': <HubIcon sx={{ fontSize: 22 }} />,
  'Webhook': <WebhookIcon sx={{ fontSize: 22 }} />,
  // 通讯
  'Email': <EmailIcon sx={{ fontSize: 22 }} />,
  'Phone': <PhoneIcon sx={{ fontSize: 22 }} />,
  // 安全与审计
  'WarningAmber': <WarningAmberIcon sx={{ fontSize: 22 }} />,
  'Security': <SecurityIcon sx={{ fontSize: 22 }} />,
  'BugReport': <BugReportIcon sx={{ fontSize: 22 }} />,
  // 财务
  'Calculate': <CalculateIcon sx={{ fontSize: 22 }} />,
  'Savings': <SavingsIcon sx={{ fontSize: 22 }} />,
  'AccountBalance': <AccountBalanceIcon sx={{ fontSize: 22 }} />,
  'RequestQuote': <RequestQuoteIcon sx={{ fontSize: 22 }} />,
  'Percent': <PercentIcon sx={{ fontSize: 22 }} />,
  'LocalOffer': <LocalOfferIcon sx={{ fontSize: 22 }} />,
  // 设计与媒体
  'Palette': <PaletteIcon sx={{ fontSize: 22 }} />,
  'Image': <ImageIcon sx={{ fontSize: 22 }} />,
  'MusicNote': <MusicNoteIcon sx={{ fontSize: 22 }} />,
  'VideoCamera': <VideocamIcon sx={{ fontSize: 22 }} />,
};
