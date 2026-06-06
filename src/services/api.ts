/**
 * CrossWMS 统一 API 客户端
 * 封装所有后端 HTTP 调用，类型安全
 */

import type { Warehouse, InventoryItem, TransitOrder, InboundRecord, OutboundRecord, InventoryTransaction } from '../types';
import type { Skill, UsageStats, ConflictResult } from '../types/skill';
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

// ===================== Skill Usage Statistics API =====================

/** 获取技能使用统计 */
export async function fetchSkillUsageStats(skillId?: string): Promise<Record<string, UsageStats>> {
  const query = skillId ? `?skillId=${encodeURIComponent(skillId)}` : '';
  return request<Record<string, UsageStats>>('GET', `/api/skill-usage-stats${query}`);
}

// ===================== Skill Conflict Check API =====================

/** 技能冲突检查结果 */
export interface SkillConflictCheckResponse {
  conflicts: ConflictResult[];
  isHighRisk: boolean;
}

/** 检查技能冲突 */
export async function fetchSkillConflictCheck(
  name: string,
  trigger?: string,
  tags?: string[]
): Promise<SkillConflictCheckResponse> {
  return request<SkillConflictCheckResponse>('POST', '/api/skill-conflict-check', { name, trigger, tags });
}

// ===================== Skill Events SSE API =====================

/** 连接技能事件 SSE 流 */
export function connectSkillEvents(): EventSource {
  return new EventSource(`${BASE_URL}/api/skill-events`);
}

// ===================== Skill Chain API =====================

import type {
  SkillChain,
  SkillChainNode,
  SkillChainExecution,
  SkillAudit,
} from '../types/skill';

/** 获取所有技能链 */
export async function fetchSkillChains(): Promise<SkillChain[]> {
  return request<SkillChain[]>('GET', '/api/chains');
}

/** 获取单个技能链详情 */
export async function fetchSkillChain(id: string): Promise<SkillChain> {
  return request<SkillChain>('GET', `/api/chains/${encodeURIComponent(id)}`);
}

/** 创建技能链 */
export async function createSkillChain(data: Omit<SkillChain, 'id' | 'createdAt' | 'updatedAt'>): Promise<SkillChain> {
  return request<SkillChain>('POST', '/api/chains', data);
}

/** 更新技能链 */
export async function updateSkillChain(id: string, data: Partial<SkillChain>): Promise<SkillChain> {
  return request<SkillChain>('PUT', `/api/chains/${encodeURIComponent(id)}`, data);
}

/** 删除技能链 */
export async function deleteSkillChain(id: string): Promise<void> {
  await request<void>('DELETE', `/api/chains/${encodeURIComponent(id)}`);
}

/** 执行技能链 */
export async function executeSkillChain(id: string): Promise<{ executionId: string }> {
  return request<{ executionId: string }>('POST', `/api/chains/${encodeURIComponent(id)}/execute`);
}

/** 复制技能链 */
export async function duplicateSkillChain(id: string): Promise<SkillChain> {
  return request<SkillChain>('POST', `/api/chains/${encodeURIComponent(id)}/duplicate`);
}

/** 连接链执行事件流 */
export function connectChainExecutionEvents(): EventSource {
  return new EventSource(`${BASE_URL}/api/chain-events`);
}

// ===================== 安全审查 API =====================

/** 获取技能最新审计结果 */
export async function fetchSkillAudit(skillId: string): Promise<SkillAudit | null> {
  return request<SkillAudit | null>('GET', `/api/skills/${encodeURIComponent(skillId)}/audit`);
}

/** 获取技能审计历史 */
export async function fetchSkillAuditHistory(skillId: string): Promise<SkillAudit[]> {
  return request<SkillAudit[]>('GET', `/api/skills/${encodeURIComponent(skillId)}/audit-history`);
}

/** 触发技能安全审计 */
export async function triggerSkillAudit(skillId: string, _skillPath: string, _force?: boolean): Promise<SkillAudit> {
  return request<SkillAudit>('POST', '/api/skill-audits', { skillId, force: _force });
}

/** 导出审计报告（返回文件下载 URL） */
export async function exportSkillAuditReport(skillId: string, format: 'md' | 'pdf'): Promise<string> {
  return request<string>('POST', `/api/skills/${encodeURIComponent(skillId)}/audit-export`, { format });
}

/** 批量审计技能 */
export async function batchAuditSkills(skillIds: string[]): Promise<{ queued: number }> {
  return request<{ queued: number }>('POST', '/api/skills/audits/batch', { skillIds });
}
