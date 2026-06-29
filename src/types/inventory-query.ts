/**
 * CDFKnow 自然语言库存查询 — 类型定义
 * @version 1.7.0
 */

// ===================== v1.7.0: 数据来源类型 =====================

/** AI 推断的查询数据来源（9 种 WMS 数据表） */
export type DataSourceType =
  | 'warehouses'
  | 'inventory_items'
  | 'inbound_records'
  | 'outbound_records'
  | 'transit_orders'
  | 'inventory_transactions'
  | 'transfer_orders'
  | 'replenishment_suggestions'
  | 'wms_alerts';

// ===================== 载荷与结果类型 =====================

/** AI 生成的库存查询指令 */
export interface InventoryQueryPayload {
  sql: string;
  chartType: 'table' | 'bar' | 'line' | 'pie';
  chartConfig?: ChartConfig;
  /** v1.7.0: AI 推断的数据来源表名 */
  dataSource?: DataSourceType;
  /** v1.7.0: AI 推断的查询意图 */
  queryIntent?: string;
}

/** 图表配置 */
export interface ChartConfig {
  /** X 轴数据字段名 */
  xKey?: string;
  /** Y 轴数据字段名 */
  yKey?: string;
  /** X 轴显示标签 */
  xLabel?: string;
  /** Y 轴显示标签 */
  yLabel?: string;
  /** 主色 */
  color?: string;
  /** 多色（饼图/多系列） */
  colors?: string[];
  /** 饼图名称字段 */
  nameKey?: string;
  /** 饼图值字段 */
  valueKey?: string;
}

/** 后端 SQL 安全校验 + 执行后的返回结构 */
export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  /** 是否因 LIMIT 截断 */
  truncated: boolean;
  chartType: 'table' | 'bar' | 'line' | 'pie';
  chartConfig?: ChartConfig;
  /** 实际执行的 SQL（含安全处理后的） */
  sql: string;
  /** v1.7.0: 数据来源表名（透传自 InventoryQueryPayload） */
  dataSource?: DataSourceType;
  /** v1.7.0: 查询意图（透传自 InventoryQueryPayload） */
  queryIntent?: string;
}

/** POST /api/inventory/nl-query 请求体 */
export interface NlQueryRequest {
  sql: string;
  chartType?: 'table' | 'bar' | 'line' | 'pie';
  chartConfig?: ChartConfig;
  /** v1.7.0: 数据来源 */
  dataSource?: DataSourceType;
  /** v1.7.0: 查询意图 */
  queryIntent?: string;
}

/** POST /api/inventory/nl-query 响应体 */
export interface NlQueryResponse {
  code: number;
  data: QueryResult | null;
  message: string;
}
