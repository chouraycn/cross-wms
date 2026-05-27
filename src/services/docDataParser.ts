/**
 * 腾讯文档 Sheet 数据解析器
 *
 * 将 tdoc_sheet_content API 返回的 SheetContent 解析为结构化数据：
 * - parseWarehouses  → Warehouse[]
 * - parseTransitOrders → TransitOrder[]
 * - parseInventoryItems → InventoryItem[]
 *
 * 解析结果包含 data / warnings / errors，供调用方决定如何处理。
 */

import type {
  Warehouse,
  TransitOrder,
  InventoryItem,
  TransitStatus,
  TransportMode,
} from '../types';
import { getWarehouses } from '../stores/warehouseStore';

// ===================== 通用类型 =====================

export interface ParseResult<T> {
  data: T[];
  warnings: string[];  // 跳过行的说明（非致命）
  errors: { row: number; col: string; message: string }[];  // 致命错误（该行为无效）
}

// ===================== 仓库名称映射 =====================

/**
 * 将文档中的仓库名称模糊匹配到 warehouseStore 中的仓库 id
 * 匹配规则：去空格 + 转小写后完全匹配
 */
export function matchWarehouse(name: string, warehouses: Warehouse[]): string | null {
  const target = name.trim().toLowerCase();
  const found = warehouses.find(
    (w) => w.name.trim().toLowerCase() === target
  );
  return found ? found.id : null;
}

// ===================== 列索引查找 =====================

type HeaderMap = Record<string, number>;

/** 基于表头行建立列名 → 列索引的映射（模糊匹配） */
function buildHeaderMap(headers: { cellValue: { text?: string } }[]): HeaderMap {
  const map: HeaderMap = {};
  headers.forEach((cell, idx) => {
    const raw = cell.cellValue?.text?.trim() ?? '';
    if (!raw) return;
    // 标准化：去空格、转小写，作为 key
    const key = raw.replace(/\s+/g, '').toLowerCase();
    if (key) map[key] = idx;
  });
  return map;
}

/** 从 SheetContent 提取表头行（第一行）和后续数据行 */
function extractSheetRows(sheet: {
  gridData: { rows: { values: { cellValue: { text?: string } }[] }[] };
}): {
  headers: { cellValue: { text?: string } }[];
  dataRows: { values: { cellValue: { text?: string } }[] }[];
} {
  const rawRows = sheet.gridData?.rows ?? [];
  if (rawRows.length === 0) {
    return { headers: [], dataRows: [] };
  }
  return {
    headers: rawRows[0].values,
    dataRows: rawRows.slice(1),
  };
}

/** 安全读取单元格文本 */
function cellText(row: { values: { cellValue: { text?: string } }[] }, colIdx: number): string {
  return row.values?.[colIdx]?.cellValue?.text?.trim() ?? '';
}

/** 安全读取数字单元格 */
function cellNumber(row: { values: { cellValue: { text?: string } }[] }, colIdx: number): number | null {
  const raw = cellText(row, colIdx);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ===================== 仓库解析 =====================

const WAREHOUSE_COL_ALIAS: Record<string, string[]> = {
  name: ['name', '仓库名称', '仓库名', '仓库'],
  country: ['country', '国家', '所在国'],
  city: ['city', '城市', '所在城市'],
  totalitems: ['totalitems', 'totalitems', '件数上限', '总件数', '件数'],
  useditems: ['useditems', '已用件数', '已用件数', '已用'],
  address: ['address', '地址', '详细地址'],
  manager: ['manager', '负责人', '管理员', '联系人'],
  phone: ['phone', '电话', '联系方式', '手机'],
};

function resolveCol(map: HeaderMap, aliases: string[]): number {
  for (const a of aliases) {
    const key = a.replace(/\s+/g, '').toLowerCase();
    if (map[key] !== undefined) return map[key];
  }
  return -1;
}

export function parseWarehouses(
  sheet: Parameters<typeof extractSheetRows>[0]
): ParseResult<Warehouse> {
  const { headers, dataRows } = extractSheetRows(sheet);
  const headerMap = buildHeaderMap(headers);
  const warnings: string[] = [];
  const errors: ParseResult<Warehouse>['errors'] = [];
  const data: Warehouse[] = [];

  const colName = resolveCol(headerMap, WAREHOUSE_COL_ALIAS.name);
  const colCountry = resolveCol(headerMap, WAREHOUSE_COL_ALIAS.country);
  const colCity = resolveCol(headerMap, WAREHOUSE_COL_ALIAS.city);
  const colTotal = resolveCol(headerMap, WAREHOUSE_COL_ALIAS.totalitems);
  const colUsed = resolveCol(headerMap, WAREHOUSE_COL_ALIAS.useditems);
  const colAddress = resolveCol(headerMap, WAREHOUSE_COL_ALIAS.address);
  const colManager = resolveCol(headerMap, WAREHOUSE_COL_ALIAS.manager);
  const colPhone = resolveCol(headerMap, WAREHOUSE_COL_ALIAS.phone);

  // 检查必填列
  if (colName < 0) errors.push({ row: 0, col: 'name', message: '缺少「仓库名称」列' });
  if (colCountry < 0) errors.push({ row: 0, col: 'country', message: '缺少「国家」列' });
  if (colCity < 0) errors.push({ row: 0, col: 'city', message: '缺少「城市」列' });
  if (colTotal < 0) errors.push({ row: 0, col: 'totalItems', message: '缺少「件数上限」列' });
  if (errors.length > 0) return { data, warnings, errors };

  const now = new Date().toISOString().split('T')[0];

  dataRows.forEach((row, idx) => {
    const rowNum = idx + 2; // 表头是第1行，数据从第2行开始
    const name = cellText(row, colName);
    const country = colCountry >= 0 ? cellText(row, colCountry) : '';
    const city = colCity >= 0 ? cellText(row, colCity) : '';
    const totalItemsRaw = colTotal >= 0 ? cellNumber(row, colTotal) : null;
    const usedItemsRaw = colUsed >= 0 ? cellNumber(row, colUsed) : null;

    // 必填校验
    if (!name) {
      errors.push({ row: rowNum, col: 'name', message: '仓库名称为空，跳过该行' });
      return;
    }
    if (!country) {
      errors.push({ row: rowNum, col: 'country', message: '国家为空，跳过该行' });
      return;
    }
    if (!city) {
      errors.push({ row: rowNum, col: 'city', message: '城市为空，跳过该行' });
      return;
    }
    if (totalItemsRaw === null || totalItemsRaw <= 0) {
      errors.push({ row: rowNum, col: 'totalItems', message: `件数上限无效（${totalItemsRaw}），跳过该行` });
      return;
    }

    const totalItems = totalItemsRaw;
    const usedItems = usedItemsRaw !== null && usedItemsRaw >= 0 ? usedItemsRaw : 0;
    const utilization = totalItems > 0 ? usedItems / totalItems : 0;
    let status: Warehouse['status'] = 'normal';
    if (utilization >= 0.9) status = 'full';
    else if (utilization >= 0.7) status = 'warning';

    data.push({
      id: `wh-${Date.now()}-${idx}`,
      name,
      country,
      city,
      totalVolume: totalItems,  // 保持兼容
      usedVolume: usedItems,    // 保持兼容
      totalItems,
      usedItems,
      status,
      address: colAddress >= 0 ? cellText(row, colAddress) : '',
      manager: colManager >= 0 ? cellText(row, colManager) : '',
      phone: colPhone >= 0 ? cellText(row, colPhone) : '',
      createdAt: now,
    });
  });

  return { data, warnings, errors };
}

// ===================== 在途运单解析 =====================

const TRANSIT_COL_ALIAS: Record<string, string[]> = {
  trackingno: ['trackingno', '运单号', '跟踪号', '单号'],
  fromwarehouse: ['fromwarehouse', '发出仓', '发货仓', '源仓库'],
  towarehouse: ['towarehouse', '目的仓', '收货仓', '目标仓'],
  category: ['category', '品类', '类别', '货物类型'],
  weight: ['weight', '重量', 'weightkg'],
  volume: ['volume', '体积', 'volume(m3)'],
  transportmode: ['transportmode', '运输方式', '模式', 'mode'],
  estimatedarrival: ['estimatedarrival', '预计到货', 'eta', '预计到达'],
  status: ['status', '状态', '运单状态'],
  carrier: ['carrier', '承运商', '承运方', '物流商'],
  value: ['value', '货值', '价值', '金额'],
};

const STATUS_MAP: Record<string, TransitStatus> = {
  dispatched: 'dispatched',
  in_transit: 'in_transit',
  customs: 'customs',
  arrived: 'arrived',
  'in transit': 'in_transit',
  'in-transit': 'in_transit',
  已发货: 'dispatched',
  运输中: 'in_transit',
  清关中: 'customs',
  已到货: 'arrived',
};

const MODE_MAP: Record<string, TransportMode> = {
  sea: 'sea',
  air: 'air',
  land: 'land',
  海运: 'sea',
  空运: 'air',
  陆运: 'land',
};

export function parseTransitOrders(
  sheet: Parameters<typeof extractSheetRows>[0]
): ParseResult<TransitOrder> {
  const { headers, dataRows } = extractSheetRows(sheet);
  const headerMap = buildHeaderMap(headers);
  const warnings: string[] = [];
  const errors: ParseResult<TransitOrder>['errors'] = [];
  const data: TransitOrder[] = [];

  const colTracking = resolveCol(headerMap, TRANSIT_COL_ALIAS.trackingno);
  const colFrom = resolveCol(headerMap, TRANSIT_COL_ALIAS.fromwarehouse);
  const colTo = resolveCol(headerMap, TRANSIT_COL_ALIAS.towarehouse);
  const colCategory = resolveCol(headerMap, TRANSIT_COL_ALIAS.category);
  const colWeight = resolveCol(headerMap, TRANSIT_COL_ALIAS.weight);
  const colVolume = resolveCol(headerMap, TRANSIT_COL_ALIAS.volume);
  const colMode = resolveCol(headerMap, TRANSIT_COL_ALIAS.transportmode);
  const colETA = resolveCol(headerMap, TRANSIT_COL_ALIAS.estimatedarrival);
  const colStatus = resolveCol(headerMap, TRANSIT_COL_ALIAS.status);
  const colCarrier = resolveCol(headerMap, TRANSIT_COL_ALIAS.carrier);
  const colValue = resolveCol(headerMap, TRANSIT_COL_ALIAS.value);

  if (colTracking < 0) errors.push({ row: 0, col: 'trackingNo', message: '缺少「运单号」列' });
  if (colFrom < 0) errors.push({ row: 0, col: 'fromWarehouse', message: '缺少「发出仓」列' });
  if (colTo < 0) errors.push({ row: 0, col: 'toWarehouse', message: '缺少「目的仓」列' });
  if (errors.length > 0) return { data, warnings, errors };

  const warehouses = getWarehouses();
  const now = new Date().toISOString();

  dataRows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const trackingNo = colTracking >= 0 ? cellText(row, colTracking) : '';
    const fromName = colFrom >= 0 ? cellText(row, colFrom) : '';
    const toName = colTo >= 0 ? cellText(row, colTo) : '';

    if (!trackingNo) {
      errors.push({ row: rowNum, col: 'trackingNo', message: '运单号为空，跳过该行' });
      return;
    }

    const fromWarehouseId = fromName ? matchWarehouse(fromName, warehouses) : null;
    const toWarehouseId = toName ? matchWarehouse(toName, warehouses) : null;

    if (!fromWarehouseId) {
      warnings.push(`第${rowNum}行：发出仓「${fromName}」未匹配到现有仓库，跳过`);
      return;
    }
    if (!toWarehouseId) {
      warnings.push(`第${rowNum}行：目的仓「${toName}」未匹配到现有仓库，跳过`);
      return;
    }

    // 运输方式
    const modeRaw = colMode >= 0 ? cellText(row, colMode).toLowerCase() : '';
    const transportMode: TransportMode = MODE_MAP[modeRaw] ?? 'sea';

    // 状态
    const statusRaw = colStatus >= 0 ? cellText(row, colStatus).toLowerCase() : '';
    const status: TransitStatus = STATUS_MAP[statusRaw] ?? 'in_transit';

    // 数字字段
    const weight = colWeight >= 0 ? (cellNumber(row, colWeight) ?? 0) : 0;
    const volume = colVolume >= 0 ? (cellNumber(row, colVolume) ?? 0) : 0;
    const value = colValue >= 0 ? (cellNumber(row, colValue) ?? 0) : 0;

    // ETA
    let estimatedArrival = colETA >= 0 ? cellText(row, colETA) : '';
    if (estimatedArrival && !/^\d{4}-\d{2}-\d{2}$/.test(estimatedArrival)) {
      // 尝试从 Excel 序列化日期数字转换（天数从 1900-01-01 起）
      const excelDate = Number(estimatedArrival);
      if (Number.isFinite(excelDate)) {
        const d = new Date((excelDate - 25569) * 86400000);
        if (!isNaN(d.getTime())) estimatedArrival = d.toISOString().split('T')[0];
      }
    }

    data.push({
      id: `tr-${Date.now()}-${idx}`,
      trackingNo,
      fromWarehouseId,
      toWarehouseId,
      category: colCategory >= 0 ? cellText(row, colCategory) : '',
      weight,
      volume,
      transportMode,
      estimatedArrival: estimatedArrival || now.split('T')[0],
      status,
      createdAt: now,
      statusHistory: [],
      carrier: colCarrier >= 0 ? cellText(row, colCarrier) : '',
      value,
    });
  });

  return { data, warnings, errors };
}

// ===================== 库存解析 =====================

const INVENTORY_COL_ALIAS: Record<string, string[]> = {
  sku: ['sku', 'SKU', 'sku编码', '商品编码'],
  name: ['name', '商品名称', '品名', '产品名称', '名称'],
  warehouse: ['warehouse', '仓库', '所在仓'],
  quantity: ['quantity', '数量', '库存数量', 'qty'],
  volumepunit: ['volumepunit', '单位体积', '每件体积', '单件体积'],
  inbounddate: ['inbounddate', '入库日期', '入库时间', 'inbound'],
  valuepunit: ['valuepunit', '单价', '单位价值', '每件价值'],
  category: ['category', '品类', '类别'],
};

export function parseInventoryItems(
  sheet: Parameters<typeof extractSheetRows>[0]
): ParseResult<InventoryItem> {
  const { headers, dataRows } = extractSheetRows(sheet);
  const headerMap = buildHeaderMap(headers);
  const warnings: string[] = [];
  const errors: ParseResult<InventoryItem>['errors'] = [];
  const data: InventoryItem[] = [];

  const colSku = resolveCol(headerMap, INVENTORY_COL_ALIAS.sku);
  const colName = resolveCol(headerMap, INVENTORY_COL_ALIAS.name);
  const colWarehouse = resolveCol(headerMap, INVENTORY_COL_ALIAS.warehouse);
  const colQty = resolveCol(headerMap, INVENTORY_COL_ALIAS.quantity);
  const colVP = resolveCol(headerMap, INVENTORY_COL_ALIAS.volumepunit);
  const colInbound = resolveCol(headerMap, INVENTORY_COL_ALIAS.inbounddate);
  const colVal = resolveCol(headerMap, INVENTORY_COL_ALIAS.valuepunit);
  const colCat = resolveCol(headerMap, INVENTORY_COL_ALIAS.category);

  if (colSku < 0) errors.push({ row: 0, col: 'sku', message: '缺少「SKU」列' });
  if (colQty < 0) errors.push({ row: 0, col: 'quantity', message: '缺少「数量」列' });
  if (errors.length > 0) return { data, warnings, errors };

  const warehouses = getWarehouses();
  const now = new Date().toISOString();

  dataRows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const sku = colSku >= 0 ? cellText(row, colSku) : '';
    const name = colName >= 0 ? cellText(row, colName) : '';
    const whName = colWarehouse >= 0 ? cellText(row, colWarehouse) : '';
    const qtyRaw = colQty >= 0 ? cellNumber(row, colQty) : null;

    if (!sku) {
      errors.push({ row: rowNum, col: 'sku', message: 'SKU 为空，跳过该行' });
      return;
    }
    if (qtyRaw === null || qtyRaw < 0) {
      errors.push({ row: rowNum, col: 'quantity', message: `数量无效（${qtyRaw}），跳过该行` });
      return;
    }

    const warehouseId = whName ? matchWarehouse(whName, warehouses) : null;
    if (!warehouseId) {
      warnings.push(`第${rowNum}行：仓库「${whName}」未匹配到现有仓库，跳过`);
      return;
    }

    const quantity = qtyRaw;
    const volumePerUnit = colVP >= 0 ? (cellNumber(row, colVP) ?? 0) : 0;
    const totalVolume = quantity * volumePerUnit;
    const valuePerUnit = colVal >= 0 ? (cellNumber(row, colVal) ?? 0) : 0;
    const totalValue = quantity * valuePerUnit;

    // 入库日期
    let inboundDate = colInbound >= 0 ? cellText(row, colInbound) : '';
    if (inboundDate && !/^\d{4}-\d{2}-\d{2}$/.test(inboundDate)) {
      const excelDate = Number(inboundDate);
      if (Number.isFinite(excelDate)) {
        const d = new Date((excelDate - 25569) * 86400000);
        if (!isNaN(d.getTime())) inboundDate = d.toISOString().split('T')[0];
      }
    }
    if (!inboundDate) inboundDate = now.split('T')[0];

    // 库龄预警（> 90天）
    const inboundTime = new Date(inboundDate).getTime();
    const ageDays = Math.floor((Date.now() - inboundTime) / 86400000);
    const isAgeWarning = ageDays > 90;

    data.push({
      id: `inv-${Date.now()}-${idx}`,
      sku,
      name: name || sku,
      warehouseId,
      quantity,
      volumePerUnit,
      totalVolume,
      inboundDate,
      valuePerUnit,
      totalValue,
      category: colCat >= 0 ? cellText(row, colCat) : '',
      isAgeWarning,
    });
  });

  return { data, warnings, errors };
}
