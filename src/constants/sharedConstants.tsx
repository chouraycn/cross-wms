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
] as const;

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
