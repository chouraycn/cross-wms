/**
 * 库存盘点状态映射配置
 *
 * 定义盘点状态的中文标签、颜色、操作权限等配置
 */

import type { InventoryCount } from '../types/wms';

// ===================== 状态配置 =====================

export const INVENTORY_STATUS_CONFIG: Record<
  InventoryCount['status'],
  { label: string; color: 'warning' | 'info' | 'success' | 'default'; actionLabel: string }
> = {
  pending: {
    label: '待盘点',
    color: 'warning',
    actionLabel: '录入实盘',
  },
  counted: {
    label: '已盘点',
    color: 'info',
    actionLabel: '确认调整',
  },
  adjusted: {
    label: '已调整',
    color: 'success',
    actionLabel: '查看详情',
  },
};

// ===================== 状态流转 =====================

/**
 * 状态流转规则
 * pending → (录入实盘) → counted → (确认调整) → adjusted
 */
export const STATUS_FLOW = {
  pending: ['counted'],
  counted: ['adjusted'],
  adjusted: [],
} as const;

/** 检查状态流转是否合法 */
export function canTransition(from: InventoryCount['status'], to: InventoryCount['status']): boolean {
  const allowed = STATUS_FLOW[from];
  if (!allowed) return false;
  return (allowed as readonly InventoryCount['status'][]).includes(to);
}

// ===================== 操作按钮配置 =====================

/** 不同状态下可用的操作 */
export const STATUS_ACTIONS: Record<InventoryCount['status'], ('count' | 'edit' | 'adjust' | 'delete' | 'view')[]> = {
  pending: ['count', 'edit', 'delete'],
  counted: ['adjust', 'edit', 'delete'],
  adjusted: ['view'],
};

// ===================== 差异显示配置 =====================

/** 差异颜色配置 */
export function getVarianceColor(variance: number): string {
  if (variance > 0) return '#059669';  // 盘盈 - 绿色
  if (variance < 0) return '#DC2626';  // 盘亏 - 红色
  return '#6B7280';  // 无差异 - 灰色
}

/** 差异标签 */
export function getVarianceLabel(variance: number): string {
  if (variance > 0) return `盘盈 +${variance}`;
  if (variance < 0) return `盘亏 ${variance}`;
  return '无差异';
}

// ===================== 导出文件名 =====================

export const EXPORT_FILENAME = 'inventory-counts.csv';
export const EXPORT_HEADERS = ['ID', '仓库ID', '库位编码', 'SKU', '系统数量', '实盘数量', '差异', '盘点人', '盘点时间', '状态', '备注'];
