/**
 * CrossWMS 统一 API 客户端
 * 封装所有后端 HTTP 调用，类型安全
 */

import type { Warehouse, InventoryItem, TransitOrder, InboundRecord, OutboundRecord, InventoryTransaction } from '../types';
import type { Skill } from '../types/skill';
import type { AppSettings } from '../contexts/AppSettingsContext';

const BASE_URL = 'http://localhost:3001';

// ===================== Generic Request =====================

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

// ===================== Warehouses =====================

export async function getWarehouses(): Promise<Warehouse[]> {
  return request<Warehouse[]>('GET', '/api/warehouses');
}

export async function createWarehouse(data: Warehouse): Promise<Warehouse> {
  return request<Warehouse>('POST', '/api/warehouses', data);
}

export async function updateWarehouse(id: string, data: Warehouse): Promise<Warehouse> {
  return request<Warehouse>('PUT', `/api/warehouses/${id}`, data);
}

export async function deleteWarehouse(id: string): Promise<void> {
  await request<void>('DELETE', `/api/warehouses/${id}`);
}

// ===================== Inventory =====================

export async function getInventoryItems(warehouseId?: string): Promise<InventoryItem[]> {
  const query = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : '';
  return request<InventoryItem[]>('GET', `/api/inventory${query}`);
}

export async function createInventoryItem(data: InventoryItem): Promise<InventoryItem> {
  return request<InventoryItem>('POST', '/api/inventory', data);
}

export async function updateInventoryItem(id: string, data: InventoryItem): Promise<InventoryItem> {
  return request<InventoryItem>('PUT', `/api/inventory/${id}`, data);
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await request<void>('DELETE', `/api/inventory/${id}`);
}

// ===================== Transit Orders =====================

export async function getTransitOrders(status?: string): Promise<TransitOrder[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<TransitOrder[]>('GET', `/api/transit-orders${query}`);
}

export async function createTransitOrder(data: TransitOrder): Promise<TransitOrder> {
  return request<TransitOrder>('POST', '/api/transit-orders', data);
}

export async function updateTransitOrder(id: string, data: TransitOrder): Promise<TransitOrder> {
  return request<TransitOrder>('PUT', `/api/transit-orders/${id}`, data);
}

export async function deleteTransitOrder(id: string): Promise<void> {
  await request<void>('DELETE', `/api/transit-orders/${id}`);
}

// ===================== Inbound Records =====================

export async function getInboundRecords(warehouseId?: string): Promise<InboundRecord[]> {
  const query = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : '';
  return request<InboundRecord[]>('GET', `/api/inbound-records${query}`);
}

export async function createInboundRecord(data: InboundRecord): Promise<InboundRecord> {
  return request<InboundRecord>('POST', '/api/inbound-records', data);
}

export async function updateInboundRecord(id: string, data: Partial<InboundRecord>): Promise<InboundRecord> {
  return request<InboundRecord>('PUT', `/api/inbound-records/${id}`, data);
}

export async function deleteInboundRecord(id: string): Promise<void> {
  await request<void>('DELETE', `/api/inbound-records/${id}`);
}

// ===================== Outbound Records =====================

export async function getOutboundRecords(warehouseId?: string): Promise<OutboundRecord[]> {
  const query = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : '';
  return request<OutboundRecord[]>('GET', `/api/outbound-records${query}`);
}

export async function createOutboundRecord(data: OutboundRecord): Promise<OutboundRecord> {
  return request<OutboundRecord>('POST', '/api/outbound-records', data);
}

export async function updateOutboundRecord(id: string, data: Partial<OutboundRecord>): Promise<OutboundRecord> {
  return request<OutboundRecord>('PUT', `/api/outbound-records/${id}`, data);
}

export async function deleteOutboundRecord(id: string): Promise<void> {
  await request<void>('DELETE', `/api/outbound-records/${id}`);
}

// ===================== User Skills =====================

export async function getUserSkills(): Promise<Skill[]> {
  return request<Skill[]>('GET', '/api/user-skills');
}

export async function createUserSkill(data: Skill): Promise<Skill> {
  return request<Skill>('POST', '/api/user-skills', data);
}

export async function updateUserSkill(id: string, data: Partial<Skill>): Promise<Skill> {
  return request<Skill>('PUT', `/api/user-skills/${id}`, data);
}

export async function deleteUserSkill(id: string): Promise<void> {
  await request<void>('DELETE', `/api/user-skills/${id}`);
}

// ===================== Builtin Status Patches =====================

export async function getBuiltinPatches(): Promise<Record<string, string>> {
  return request<Record<string, string>>('GET', '/api/builtin-status-patches');
}

export async function setBuiltinPatch(skillId: string, status: string): Promise<void> {
  await request<void>('PUT', '/api/builtin-status-patches', { skillId, status });
}

export async function removeBuiltinPatch(skillId: string): Promise<void> {
  await request<void>('DELETE', `/api/builtin-status-patches/${encodeURIComponent(skillId)}`);
}

// ===================== SKILL.md Scan =====================

/** SKILL.md 扫描结果（扫描不含 body，读取详情含 body） */
export interface ScannedSkillMd {
  dirName: string;
  name: string;
  description: string;
  body?: string; // scan 时不返回，read 时返回
  hasSkillMd: boolean;
}

/** 扫描 ~/.workbuddy/skills/ 下的 SKILL.md 技能包（仅元数据） */
export async function scanSkillMd(): Promise<ScannedSkillMd[]> {
  return request<ScannedSkillMd[]>('GET', '/api/skill-md-scan');
}

/** 读取指定技能的完整 SKILL.md 内容（含 body） */
export async function readSkillMd(dirName: string): Promise<ScannedSkillMd> {
  return request<ScannedSkillMd>('GET', `/api/skill-md-read/${encodeURIComponent(dirName)}`);
}

// ===================== App Settings =====================

export async function getAppSettings(): Promise<AppSettings | null> {
  try {
    return await request<AppSettings>('GET', '/api/app-settings/default');
  } catch {
    return null;
  }
}

export async function updateAppSettings(settings: AppSettings): Promise<void> {
  await request<void>('PUT', '/api/app-settings/default', settings);
}

// ===================== Migration =====================

export interface MigratePayload {
  warehouses?: unknown[];
  inventoryItems?: unknown[];
  transitOrders?: unknown[];
  userSkills?: unknown[];
  builtinStatusPatches?: Record<string, string>;
  appSettings?: unknown;
}

export async function migrate(payload: MigratePayload): Promise<unknown> {
  return request<unknown>('POST', '/api/migrate', payload);
}

// ===================== Inbound / Outbound Operations =====================

export interface InboundPayload {
  sku: string;
  name: string;
  warehouseId: string;
  quantity: number;
  supplier?: string;
  batchNo?: string;
  operator?: string;
  remark?: string;
}

export interface OutboundPayload {
  sku: string;
  name: string;
  warehouseId: string;
  quantity: number;
  customer?: string;
  orderNo?: string;
  operator?: string;
  remark?: string;
}

export interface InboundResponse {
  inboundRecord: InboundRecord;
  inventoryItem: InventoryItem;
  transaction: InventoryTransaction;
}

export interface OutboundResponse {
  outboundRecord: OutboundRecord;
  inventoryItem: InventoryItem;
  transaction: InventoryTransaction;
}

/** 入库操作：调用 POST /api/inbound */
export async function createInbound(data: InboundPayload): Promise<InboundResponse> {
  const res = await fetch(`${BASE_URL}/api/inbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || '入库失败');
  return json.data as InboundResponse;
}

/** 出库操作：调用 POST /api/outbound */
export async function createOutbound(data: OutboundPayload): Promise<OutboundResponse> {
  const res = await fetch(`${BASE_URL}/api/outbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || '出库失败');
  return json.data as OutboundResponse;
}

/** 查询库存变动历史：调用 GET /api/inventory-transactions */
export async function getInventoryTransactions(params?: {
  page?: number;
  pageSize?: number;
  type?: string;
  warehouseId?: string;
  startDate?: string;
  endDate?: string;
  sku?: string;
}): Promise<{ items: InventoryTransaction[]; total: number; page: number; pageSize: number }> {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') query.set(k, String(v));
    });
  }
  const qs = query.toString();
  const path = `/api/inventory-transactions${qs ? `?${qs}` : ''}`;
  const res = await fetch(`${BASE_URL}${path}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || '查询变动历史失败');
  return json.data as { items: InventoryTransaction[]; total: number; page: number; pageSize: number };
}
