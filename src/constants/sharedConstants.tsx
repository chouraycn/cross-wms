/**
 * 全局共享常量
 */

// ===================== Automation Engine =====================

export const AUTOMATION_TRIGGER_TYPES = [
  { value: 'schedule', label: '定时触发' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'manual', label: '手动触发' },
  { value: 'chain', label: '链式调用' },
] as const;

export const AUTOMATION_TASK_TYPES = [
  { value: 'sync', label: '数据同步' },
  { value: 'snapshot', label: '库存快照' },
  { value: 'report', label: '报表生成' },
  { value: 'volume_alert', label: '容积率预警' },
  { value: 'chain', label: '技能链' },
  { value: 'custom', label: '自定义' },
  { value: 'wms_alert_check', label: 'WMS 预警检查' },
  { value: 'wms_report_gen', label: 'WMS 报表生成' },
] as const;

export const AUTOMATION_TASK_TYPE_LABELS: Record<string, string> = {
  sync: '数据同步',
  snapshot: '库存快照',
  report: '报表生成',
  volume_alert: '容积率预警',
  chain: '技能链',
  custom: '自定义',
  wms_alert_check: 'WMS 预警检查',
  wms_report_gen: 'WMS 报表生成',
};

export const AUTOMATION_TASK_TYPE_ICONS: Record<string, string> = {
  sync: 'SyncIcon',
  snapshot: 'CameraAltIcon',
  report: 'AssessmentIcon',
  volume_alert: 'WarningIcon',
  chain: 'AccountTreeIcon',
  custom: 'CodeIcon',
  wms_alert_check: 'NotificationsActiveIcon',
  wms_report_gen: 'DescriptionIcon',
};

export const AUTOMATION_TASK_TYPE_COLORS: Record<string, string> = {
  sync: '#1976d2',
  snapshot: '#388e3c',
  report: '#f57c00',
  volume_alert: '#d32f2f',
  chain: '#7b1fa2',
  custom: '#616161',
  wms_alert_check: '#ed6c02',
  wms_report_gen: '#0288d1',
};

export const AUTOMATION_STATUS_LABELS: Record<string, string> = {
  active: '运行中',
  paused: '已暂停',
  draft: '草稿',
};

export const AUTOMATION_RUN_STATUS_LABELS: Record<string, string> = {
  running: '执行中',
  success: '成功',
  failed: '失败',
};

export const AUTOMATION_DEFAULT_TIMEOUT_MS = 30000;
export const AUTOMATION_DEFAULT_RETRY_COUNT = 0;
export const AUTOMATION_DEFAULT_RETRY_DELAY_MS = 5000;
