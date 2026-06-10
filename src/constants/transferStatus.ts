/**
 * 调拨单状态映射配置
 *
 * 定义调拨状态的中文标签、颜色、操作权限等配置
 * 状态流转: draft → submitted → in_transit → completed
 */

import type { TransferStatus } from '../types/wms';

// ===================== 状态配置 =====================

export const STATUS_CONFIG: Record<
  TransferStatus,
  { label: string; color: 'default' | 'warning' | 'info' | 'success'; actionLabel: string }
> = {
  draft: {
    label: '草稿',
    color: 'default',
    actionLabel: '提交',
  },
  submitted: {
    label: '已提交',
    color: 'warning',
    actionLabel: '确认收货',
  },
  in_transit: {
    label: '在途',
    color: 'info',
    actionLabel: '确认收货',
  },
  completed: {
    label: '已完成',
    color: 'success',
    actionLabel: '查看详情',
  },
};

// ===================== 状态流转 =====================

/**
 * 状态流转规则
 * draft → submitted → in_transit → completed
 * submitted ↔ in_transit (bind/unbind transit)
 */
export const STATUS_FLOW: Record<TransferStatus, TransferStatus[]> = {
  draft: ['submitted'],
  submitted: ['in_transit', 'completed'],  // can go to in_transit via bind, or directly to completed via receive
  in_transit: ['submitted', 'completed'],   // can go back to submitted via unbind, or to completed via receive
  completed: [],
};

/** 检查状态流转是否合法 */
export function canTransition(from: TransferStatus, to: TransferStatus): boolean {
  const allowed = STATUS_FLOW[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

// ===================== 操作按钮配置 =====================

/** 不同状态下可用的操作 */
export const STATUS_ACTIONS: Record<TransferStatus, ('edit' | 'submit' | 'delete' | 'receive' | 'bindTransit' | 'unbindTransit' | 'view')[]> = {
  draft: ['edit', 'submit', 'delete'],
  submitted: ['receive', 'bindTransit'],
  in_transit: ['receive', 'unbindTransit'],
  completed: ['view'],
};
