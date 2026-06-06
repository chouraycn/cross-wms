/**
 * AutomationPage 共享常量与样式
 *
 * 从 AutomationPage.tsx 中提取的配置、图标映射、颜色方案
 */

import React from 'react';
import SyncIcon from '@mui/icons-material/Sync';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import AssessmentIcon from '@mui/icons-material/Assessment';
import WarningIcon from '@mui/icons-material/Warning';
import CodeIcon from '@mui/icons-material/Code';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import type { TaskType, ActionType } from '../../services/automation';

// ===================== 任务类型配置 =====================

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  'data-sync': '数据同步',
  'inventory-snapshot': '库存快照',
  'report-gen': '报表生成',
  'volume-alert': '容积率预警',
  'custom': '自定义',
  'skill-chain': '技能链',
};

export const TASK_TYPE_ICONS: Record<TaskType, React.ReactNode> = {
  'data-sync': <SyncIcon sx={{ fontSize: 16 }} />,
  'inventory-snapshot': <CameraAltIcon sx={{ fontSize: 16 }} />,
  'report-gen': <AssessmentIcon sx={{ fontSize: 16 }} />,
  'volume-alert': <WarningIcon sx={{ fontSize: 16 }} />,
  'custom': <CodeIcon sx={{ fontSize: 16 }} />,
  'skill-chain': <AccountTreeIcon sx={{ fontSize: 16 }} />,
};

export const TEMPLATE_ICON_MAP: Record<string, React.ReactNode> = {
  'SyncIcon': <SyncIcon sx={{ fontSize: 18 }} />,
  'CameraAltIcon': <CameraAltIcon sx={{ fontSize: 18 }} />,
  'AssessmentIcon': <AssessmentIcon sx={{ fontSize: 18 }} />,
  'WarningIcon': <WarningIcon sx={{ fontSize: 18 }} />,
  'AccountTreeIcon': <AccountTreeIcon sx={{ fontSize: 18 }} />,
};

export const TASK_TYPE_COLORS: Record<TaskType, string> = {
  'data-sync': '#2563EB',
  'inventory-snapshot': '#7C3AED',
  'report-gen': '#059669',
  'volume-alert': '#D97706',
  'custom': '#6B7280',
  'skill-chain': '#DB2777',
};

export const WEEKDAY_LABELS: Record<string, string> = {
  MO: '周一', TU: '周二', WE: '周三', TH: '周四', FR: '周五', SA: '周六', SU: '周日',
};

export const WEEKDAY_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export const EXEC_STATUS_CONFIG = {
  success: { label: '成功', color: '#059669', bg: '#ECFDF5', Icon: CheckCircleOutlineIcon },
  failed: { label: '失败', color: '#EF4444', bg: '#FEF2F2', Icon: ErrorOutlineIcon },
  running: { label: '运行中', color: '#D97706', bg: '#FFFBEB', Icon: HourglassEmptyIcon },
};

// Action chain 选项
export const ACTION_CHAIN_OPTIONS: { value: ActionType; label: string; desc: string }[] = [
  { value: 'sync-warehouses', label: '同步仓库', desc: '拉取并更新仓库列表' },
  { value: 'sync-inventory', label: '同步库存', desc: '拉取最新库存数据' },
  { value: 'sync-transit', label: '同步在途', desc: '拉取在途订单数据' },
  { value: 'snapshot', label: '库存快照', desc: '保存当前库存快照' },
  { value: 'check-volume', label: '检查容积率', desc: '检查仓库容积率并预警' },
  { value: 'gen-report', label: '生成报表', desc: '生成运营数据报表' },
  { value: 'notify', label: '发送通知', desc: '发送桌面通知' },
];

// ===================== Tab 定义 =====================

export type TabKey = 'configured' | 'history' | 'templates';

export const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'configured', label: '已配置', icon: null },
  { key: 'history', label: '执行历史', icon: null },
  { key: 'templates', label: '任务模板', icon: null },
];

// ===================== 共享样式 =====================

export const sharedStyles = {
  cardBorder: '1px solid #E5E7EB',
  cardRadius: 2,
  textSmall: { fontSize: '0.7rem', color: '#6B7280' },
  textTiny: { fontSize: '0.65rem', color: '#9CA3AF' },
  chipSmall: {
    height: 18,
    fontSize: '0.625rem',
    fontWeight: 500,
  },
} as const;
