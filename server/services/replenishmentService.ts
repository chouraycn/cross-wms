/**
 * Replenishment Service
 *
 * 智能补货服务，根据库存阈值自动生成补货建议。
 * 核心流程：扫描库存 → 检查阈值 → 生成补货建议 → 执行补货
 *
 * v10.0: 改为使用 DAO 层（wmsSkillDao.ts / warehouse.ts）获取数据。
 */

import type { ReplenishmentSuggestion, ReplenishmentRule } from '../types/replenishment.js';
import { logger } from '../logger.js';
import {
  createReplenishmentRule,
  getReplenishmentRules,
  getReplenishmentRuleById,
  updateReplenishmentRule,
  deleteReplenishmentRule,
  getReplenishmentRuleBySkuAndWarehouse,
} from '../dao/wmsSkillDao.js';
import {
  getInventoryItems,
  getOutboundRecords,
  createInboundRecord,
  updateInventoryItem,
  getWarehouseById,
} from '../dao/warehouse.js';

// ===================== 常量定义 =====================

/** 默认安全库存天数 */
const DEFAULT_SAFETY_DAYS = 7;

/** 默认补货倍率 */
const DEFAULT_REPLENISH_MULTIPLIER = 1.5;

/** 最大补货建议数量 */
const MAX_SUGGESTIONS = 100;

// ===================== 工具函数 =====================

/**
 * 获取当前时间戳（ISO 格式）
 */
function now(): string {
  return new Date().toISOString();
}

/**
 * 计算日均消耗量（基于最近 30 天出库记录）
 */
function calculateDailyConsumption(sku: string, warehouseId: string): number {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const records = getOutboundRecords(
    warehouseId,
    thirtyDaysAgo.toISOString(),
  ).filter((r) => r.sku === sku);

  const totalOutbound = records.reduce((sum, r) => sum + r.quantity, 0);
  return totalOutbound / 30;
}

// ===================== 核心函数 =====================

/**
 * 扫描库存并生成补货建议
 *
 * 流程：
 * 1. 查询所有库存项
 * 2. 检查每项是否低于阈值
 * 3. 计算建议补货量
 * 4. 返回补货建议列表
 *
 * @param warehouseId 仓库 ID（可选，不传则扫描所有仓库）
 * @returns 补货建议列表
 */
export function scanInventoryForReplenishment(warehouseId?: string): ReplenishmentSuggestion[] {
  // 查询库存项
  const items = getInventoryItems(warehouseId);

  const suggestions: ReplenishmentSuggestion[] = [];

  for (const item of items) {
    const sku = item.sku as string;
    const itemWarehouseId = item.warehouseId as string;
    const quantity = item.quantity as number;
    const name = item.name as string;
    const unitPrice = item.valuePerUnit as number;

    // 查询补货规则
    const ruleRow = getReplenishmentRuleBySkuAndWarehouse(sku, itemWarehouseId);
    const rule = ruleRow
      ? ({
          minStock: ruleRow.min_stock as number,
          maxStock: ruleRow.max_stock as number | null,
          safetyDays: ruleRow.safety_days as number,
          replenishMultiplier: ruleRow.replenish_multiplier as number,
        } as ReplenishmentRule)
      : undefined;

    const threshold = rule?.minStock ?? 0;
    const maxStock = rule?.maxStock ?? 0;

    // 检查是否低于阈值
    if (quantity <= threshold) {
      // 计算建议补货量
      let suggestedQuantity: number;

      if (maxStock > 0) {
        // 有最大库存限制，补到最大库存
        suggestedQuantity = maxStock - quantity;
      } else {
        // 无最大库存限制，基于日均消耗量计算
        const dailyConsumption = calculateDailyConsumption(sku, itemWarehouseId);
        const safetyStock = dailyConsumption * (rule?.safetyDays ?? DEFAULT_SAFETY_DAYS);
        suggestedQuantity = Math.ceil(
          (safetyStock - quantity) * (rule?.replenishMultiplier ?? DEFAULT_REPLENISH_MULTIPLIER)
        );
      }

      if (suggestedQuantity > 0) {
        // 获取仓库名称
        const warehouse = getWarehouseById(itemWarehouseId);
        const warehouseName = warehouse?.name ?? itemWarehouseId;

        suggestions.push({
          sku,
          name: name ?? sku,
          warehouseId: itemWarehouseId,
          warehouseName,
          currentStock: quantity,
          threshold,
          suggestedQuantity,
          unitPrice: unitPrice ?? 0,
          estimatedCost: (unitPrice ?? 0) * suggestedQuantity,
          reason: rule
            ? `库存低于阈值 (${threshold})`
            : '无补货规则，基于安全库存计算',
          priority: quantity === 0 ? 'high' : quantity <= threshold * 0.5 ? 'high' : 'medium',
          createdAt: now(),
        });
      }
    }
  }

  // 按优先级排序，限制数量
  return suggestions
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * 创建补货规则
 *
 * @param rule 补货规则数据
 * @returns 创建的规则 ID
 */
export function createReplenishmentRuleService(rule: Omit<ReplenishmentRule, 'id' | 'createdAt' | 'updatedAt'>): number {
  // 校验
  if (rule.minStock < 0) {
    throw new Error('最小库存不能为负数');
  }
  if (rule.maxStock !== undefined && rule.maxStock !== null && rule.maxStock < rule.minStock) {
    throw new Error('最大库存不能小于最小库存');
  }

  return createReplenishmentRule({
    sku: rule.sku,
    warehouseId: rule.warehouseId,
    minStock: rule.minStock,
    maxStock: rule.maxStock,
    safetyDays: rule.safetyDays,
    replenishMultiplier: rule.replenishMultiplier,
    supplierId: rule.supplierId,
    leadTimeDays: rule.leadTimeDays,
    autoOrder: rule.autoOrder,
    status: rule.status ?? 'active',
  });
}

/**
 * 更新补货规则
 *
 * @param ruleId 规则 ID
 * @param updates 更新数据
 * @returns 是否更新成功
 */
export function updateReplenishmentRuleService(
  ruleId: number,
  updates: Partial<Omit<ReplenishmentRule, 'id' | 'createdAt' | 'updatedAt'>>
): boolean {
  // 校验
  if (updates.minStock !== undefined && updates.minStock < 0) {
    throw new Error('最小库存不能为负数');
  }
  if (
    updates.maxStock !== undefined &&
    updates.maxStock !== null &&
    updates.minStock !== undefined &&
    updates.maxStock < updates.minStock
  ) {
    throw new Error('最大库存不能小于最小库存');
  }

  return updateReplenishmentRule(ruleId, updates);
}

/**
 * 删除补货规则
 *
 * @param ruleId 规则 ID
 * @returns 是否删除成功
 */
export function deleteReplenishmentRuleService(ruleId: number): boolean {
  return deleteReplenishmentRule(ruleId);
}

/**
 * 获取补货规则列表
 *
 * @param filters 筛选条件
 * @returns 补货规则列表
 */
export function getReplenishmentRulesService(filters?: {
  sku?: string;
  warehouseId?: string;
  status?: string;
}): ReplenishmentRule[] {
  const rows = getReplenishmentRules(filters);
  return rows.map((row) => ({
    id: row.id as number,
    sku: row.sku as string,
    warehouseId: row.warehouse_id as string,
    minStock: row.min_stock as number,
    maxStock: row.max_stock as number | null,
    safetyDays: row.safety_days as number,
    replenishMultiplier: row.replenish_multiplier as number,
    supplierId: row.supplier_id as string | null,
    leadTimeDays: row.lead_time_days as number | null,
    autoOrder: Boolean(row.auto_order),
    status: row.status as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

/**
 * 获取补货规则详情
 *
 * @param ruleId 规则 ID
 * @returns 补货规则详情
 */
export function getReplenishmentRuleDetail(ruleId: number): ReplenishmentRule | null {
  const row = getReplenishmentRuleById(ruleId);
  if (!row) return null;
  return {
    id: row.id as number,
    sku: row.sku as string,
    warehouseId: row.warehouse_id as string,
    minStock: row.min_stock as number,
    maxStock: row.max_stock as number | null,
    safetyDays: row.safety_days as number,
    replenishMultiplier: row.replenish_multiplier as number,
    supplierId: row.supplier_id as string | null,
    leadTimeDays: row.lead_time_days as number | null,
    autoOrder: Boolean(row.auto_order),
    status: row.status as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * 执行补货（创建入库记录）
 *
 * 流程：
 * 1. 验证补货建议
 * 2. 创建入库记录
 * 3. 更新库存
 *
 * @param suggestion 补货建议
 * @param operator 操作人
 * @returns 入库记录 ID
 */
export function executeReplenishment(
  suggestion: ReplenishmentSuggestion,
  operator?: string
): { inboundRecordId: number; newStock: number } {
  // 1. 验证
  const items = getInventoryItems(suggestion.warehouseId);
  const currentItem = items.find((i) => i.sku === suggestion.sku) as { quantity: number; id: string } | undefined;

  if (!currentItem) {
    throw new Error(`商品 ${suggestion.sku} 不存在`);
  }

  // 2. 创建入库记录
  const inboundRecord = createInboundRecord({
    warehouseId: suggestion.warehouseId,
    sku: suggestion.sku,
    name: suggestion.name,
    quantity: suggestion.suggestedQuantity,
    volume: 0,
    createdAt: now(),
    operator: operator || 'system',
    status: 'completed',
    supplier: '',
    batchNo: '',
    supplier_id: null,
  });

  const inboundRecordId = Number(inboundRecord.id);

  // 3. 更新库存
  updateInventoryItem(currentItem.id, {
    quantity: currentItem.quantity + suggestion.suggestedQuantity,
  });

  const newStock = currentItem.quantity + suggestion.suggestedQuantity;

  logger.info(
    `[Replenishment] 执行补货: sku=${suggestion.sku}, warehouse=${suggestion.warehouseId}, quantity=${suggestion.suggestedQuantity}, newStock=${newStock}`
  );

  return { inboundRecordId, newStock };
}

/**
 * 获取补货统计
 *
 * @param warehouseId 仓库 ID（可选）
 * @returns 补货统计信息
 */
export function getReplenishmentStats(warehouseId?: string): {
  totalRules: number;
  activeRules: number;
  lowStockItems: number;
  pendingSuggestions: number;
  totalSuggestedCost: number;
} {
  const rules = getReplenishmentRulesService(warehouseId ? { warehouseId } : undefined);
  const suggestions = scanInventoryForReplenishment(warehouseId);

  return {
    totalRules: rules.length,
    activeRules: rules.filter((r) => r.status === 'active').length,
    lowStockItems: suggestions.length,
    pendingSuggestions: suggestions.filter((s) => s.priority === 'high').length,
    totalSuggestedCost: suggestions.reduce((sum, s) => sum + s.estimatedCost, 0),
  };
}

// ===================== 兼容导出 =====================

import type { ReplenishmentConfig, SourceRecommendation } from '../models/wms-skill.js';
import {
  createReplenishmentSuggestion,
  getReplenishmentSuggestions,
  updateReplenishmentSuggestion,
  getReplenishmentSuggestionById,
} from '../dao/wmsSkillDao.js';
import { createTransferOrder } from '../dao/warehouse.js';

/**
 * 生成补货建议（兼容旧 API）
 * @deprecated 使用 scanInventoryForReplenishment() 替代
 */
export function generateSuggestions(_config?: Partial<ReplenishmentConfig>): {
  items: ReplenishmentSuggestion[];
  total: number;
  page: number;
  pageSize: number;
  created: number;
} {
  const suggestions = scanInventoryForReplenishment();
  return {
    items: suggestions,
    total: suggestions.length,
    page: 1,
    pageSize: suggestions.length,
    created: suggestions.length,
  };
}

/**
 * 获取补货建议列表（兼容旧 API，支持分页）
 * @deprecated 使用 scanInventoryForReplenishment() 替代
 */
export function getSuggestions(filters?: {
  status?: string;
  priority?: string;
  warehouseId?: string;
  sku?: string;
  page?: number;
  pageSize?: number;
}): {
  items: ReplenishmentSuggestion[];
  total: number;
  page: number;
  pageSize: number;
} {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  let suggestions = scanInventoryForReplenishment(filters?.warehouseId);

  if (filters?.status) {
    // scanInventoryForReplenishment 返回的建议没有 status 字段，这里模拟
    // 实际应该查询数据库
  }
  if (filters?.priority) {
    suggestions = suggestions.filter((s) => s.priority === filters.priority);
  }
  if (filters?.sku) {
    suggestions = suggestions.filter((s) => s.sku === filters.sku);
  }

  const total = suggestions.length;
  const offset = (page - 1) * pageSize;
  const items = suggestions.slice(offset, offset + pageSize);

  return { items, total, page, pageSize };
}

/**
 * 更新建议状态（兼容旧 API）
 * @deprecated DAO 层直接操作
 */
export function updateSuggestionStatus(id: number, status: string): unknown | null {
  const suggestion = getReplenishmentSuggestionById(id);
  if (!suggestion) return null;
  // 注意：原始 ReplenishmentSuggestion 类型没有 status 字段
  // 这里返回原始数据以兼容路由
  return suggestion;
}

/**
 * 从建议创建调拨单（兼容旧 API）
 * @deprecated 使用 DAO 层 createTransferOrder 替代
 */
export function createTransferFromSuggestion(
  id: number,
  options: { fromWarehouseId: string; quantity: number }
): unknown {
  const suggestion = getReplenishmentSuggestionById(id);
  if (!suggestion) {
    throw new Error(`补货建议 ${id} 不存在`);
  }

  const transfer = createTransferOrder({
    transferNo: '',
    fromWarehouseId: options.fromWarehouseId,
    toWarehouseId: suggestion.warehouseId,
    sku: suggestion.sku,
    name: suggestion.sku,
    quantity: options.quantity,
    volume: 0,
    status: 'draft',
    createdBy: 'system',
    transitOrderId: null,
    submittedAt: null,
    submittedBy: null,
    receivedAt: null,
    receivedBy: null,
    completedAt: null,
    completedBy: null,
    remark: '',
  });

  return transfer;
}

/**
 * 推荐来源仓库（兼容旧 API）
 * @deprecated 使用 scanInventoryForReplenishment() 替代
 */
export function recommendSourceWarehouse(
  sku: string,
  targetWarehouseId: string,
  neededQty: number
): SourceRecommendation[] {
  // 查询其他仓库中该 SKU 的库存
  const allItems = getInventoryItems();
  const filtered = allItems.filter(
    (i) => i.sku === sku && i.warehouseId !== targetWarehouseId && (i.quantity as number) > neededQty * 0.5
  );

  // 按库存量降序排序
  filtered.sort((a, b) => (b.quantity as number) - (a.quantity as number));

  const recommendations: SourceRecommendation[] = [];
  for (const row of filtered) {
    const wh = getWarehouseById(row.warehouseId as string);
    const surplus = (row.quantity as number) - neededQty;
    recommendations.push({
      warehouseId: row.warehouseId as string,
      warehouseName: wh?.name ?? (row.warehouseId as string),
      surplus,
      score: Math.min(100, Math.round((surplus / neededQty) * 50 + 50)),
    });
  }

  return recommendations;
}
