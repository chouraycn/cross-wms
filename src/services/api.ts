/**
 * CDF Know Clow 统一 API 客户端
 * 封装所有后端 HTTP 调用，类型安全
 */

import type { Warehouse, InventoryItem, TransitOrder, InboundRecord, OutboundRecord, InventoryTransaction } from '../types';
import type { Skill, UsageStats, ConflictResult } from '../types/skill';
import type { AppSettings } from '../contexts/AppSettingsContext';
import type { ModelConfig, ModelsConfig } from '../types/models';
import type { Task } from '../types/task';
import type { Project } from '../types/project';
import type {
  Partner,
  PartnerOption,
  PartnerType,
  PartnerListResponse,
  QuickCreatePartnerPayload,
} from '../types/partners';
import { API_BASE_URL } from '../constants/api';

const BASE_URL = API_BASE_URL;

// ===================== Generic Request =====================

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const opts: RequestInit = { method, headers };
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
  supplier_id?: string;
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
  customer_id?: string;
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
  return request<SkillChain[]>('GET', '/api/skill-chains');
}

/** 获取单个技能链详情 */
export async function fetchSkillChain(id: string): Promise<SkillChain> {
  return request<SkillChain>('GET', `/api/skill-chains/${encodeURIComponent(id)}`);
}

/** 创建技能链 */
export async function createSkillChain(data: Omit<SkillChain, 'id' | 'createdAt' | 'updatedAt'>): Promise<SkillChain> {
  return request<SkillChain>('POST', '/api/skill-chains', data);
}

/** 更新技能链 */
export async function updateSkillChain(id: string, data: Partial<SkillChain>): Promise<SkillChain> {
  return request<SkillChain>('PUT', `/api/skill-chains/${encodeURIComponent(id)}`, data);
}

/** 删除技能链 */
export async function deleteSkillChain(id: string): Promise<void> {
  await request<void>('DELETE', `/api/skill-chains/${encodeURIComponent(id)}`);
}

/** 执行技能链 */
export async function executeSkillChain(id: string): Promise<{ executionId: string }> {
  return request<{ executionId: string }>('POST', `/api/skill-chains/${encodeURIComponent(id)}/execute`);
}

/** 复制技能链 */
export async function duplicateSkillChain(id: string): Promise<SkillChain> {
  return request<SkillChain>('POST', `/api/skill-chains/${encodeURIComponent(id)}/duplicate`);
}

/** 连接链执行事件流（需传入 executionId 订阅特定执行） */
export function connectChainExecutionEvents(executionId: string): EventSource {
  return new EventSource(`${BASE_URL}/api/chain-execution-events?execId=${encodeURIComponent(executionId)}`);
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

// ===================== Skill Export API =====================

/** 导出技能为 ZIP（返回 Blob 供前端下载） */
export async function exportSkillAsZip(skillId: string, skillName: string): Promise<void> {
  const url = `${BASE_URL}/api/skills/${encodeURIComponent(skillId)}/export`;

  // 优先使用 pywebview 原生保存对话框（DMG/桌面应用环境）
  if (typeof window !== 'undefined' && (window as any).pywebview?.api?.save_file) {
    try {
      const blob = await fetch(url).then(r => r.blob());
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = async () => {
          try {
            const base64 = (reader.result as string).split(',')[1];
            const filename = `${skillName}-skill.zip`;
            // pywebview 的 save_file 会弹出系统保存对话框
            await (window as any).pywebview.api.save_file(filename, base64, 'application/zip');
            resolve();
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('[exportSkillAsZip] pywebview save_file failed, fallback to browser download', e);
    }
  }

  // 浏览器环境：直接触发下载
  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `导出失败 (${response.status})`);
  }
  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${skillName}-skill.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

// ===================== Tasks API =====================

/** 获取任务列表（可选按 projectId 过滤） */
export async function getTasks(projectId?: string): Promise<Task[]> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  return request<Task[]>('GET', `/api/tasks${query}`);
}

/** 获取指定项目下的任务 */
export async function getProjectTasks(projectId: string): Promise<Task[]> {
  return request<Task[]>('GET', `/api/tasks?projectId=${encodeURIComponent(projectId)}`);
}

/** 创建任务 */
export async function createTask(data: {
  title: string;
  description: string;
  status: Task['status'];
  priority: Task['priority'];
  assignee: string;
  tags: string[];
  dueDate: string;
  projectId: string;
}): Promise<Task> {
  return request<Task>('POST', '/api/tasks', data);
}

/** 更新任务 */
export async function updateTask(id: string, data: Partial<{
  title: string;
  description: string;
  status: Task['status'];
  priority: Task['priority'];
  assignee: string;
  tags: string[];
  dueDate: string;
}>): Promise<Task> {
  return request<Task>('PUT', `/api/tasks/${encodeURIComponent(id)}`, data);
}

/** 删除任务 */
export async function deleteTask(id: string): Promise<void> {
  await request<void>('DELETE', `/api/tasks/${encodeURIComponent(id)}`);
}

/** 从 localStorage 迁移任务到数据库 */
export async function migrateTasks(payload: {
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    status: Task['status'];
    priority: Task['priority'];
    assignee: string;
    tags: string[];
    dueDate: string;
    projectId: string;
    createdAt: string;
    updatedAt: string;
  }>;
}): Promise<{ imported: number; skipped: number }> {
  return request<{ imported: number; skipped: number }>('POST', '/api/tasks/migrate', payload);
}

// ===================== Projects API =====================

/** 获取所有项目 */
export async function getProjects(): Promise<Project[]> {
  return request<Project[]>('GET', '/api/projects');
}

/** 创建项目 */
export async function createProject(data: Partial<Project> & { name: string }): Promise<Project> {
  return request<Project>('POST', '/api/projects', data);
}

/** 更新项目 */
export async function updateProject(id: string, data: Partial<Project> & { name?: string }): Promise<Project> {
  return request<Project>('PUT', `/api/projects/${encodeURIComponent(id)}`, data);
}

/** 删除项目 */
export async function deleteProject(id: string): Promise<void> {
  await request<void>('DELETE', `/api/projects/${encodeURIComponent(id)}`);
}

// ===================== Models (models.json) =====================

export interface ModelsFileResponse {
  version: number;
  models: ModelConfig[];
  defaultModelId: string;
  updatedAt: string;
}

/** 获取模型配置（从 models.json） */
export async function getModelsConfig(): Promise<ModelsFileResponse> {
  return request<ModelsFileResponse>('GET', '/api/models');
}

/** 保存模型配置到 models.json */
export async function saveModelsConfig(models: ModelConfig[], defaultModelId: string): Promise<ModelsFileResponse> {
  return request<ModelsFileResponse>('PUT', '/api/models', { models, defaultModelId });
}

/** 重置为内置默认模型 */
export async function resetModelsConfig(): Promise<ModelsFileResponse> {
  return request<ModelsFileResponse>('POST', '/api/models/reset');
}

/** 测试 API 连接（返回可用模型列表） */
export interface TestConnectionResult {
  success: boolean;
  message: string;
  models?: string[];
  /** 模型 ID 是否在可用列表中验证通过 */
  modelValid?: boolean;
}

export async function testModelConnection(
  apiEndpoint: string,
  apiKey: string,
  modelId: string,
): Promise<TestConnectionResult> {
  return request<TestConnectionResult>(
    'POST',
    '/api/models/test-connection',
    { apiEndpoint, apiKey, modelId },
  );
}

/** 健康检查结果项 */
export interface HealthCheckItem {
  modelId: string;
  status: 'healthy' | 'unhealthy' | 'timeout' | 'skipped';
  message: string;
  latency?: number;
  checkedAt: string;
}

/** 批量健康检查（所有已启用模型） */
export async function healthCheckModels(models?: ModelConfig[]): Promise<HealthCheckItem[]> {
  const body = models ? { models } : {};
  return request<HealthCheckItem[]>('POST', '/api/models/health-check', body);
}

/** 本地发现的模型 */
export interface DiscoveredLocalModel {
  id: string;
  name: string;
  provider: string;
  apiEndpoint: string;
  size?: string;
  family?: string;
  parameterSize?: string;
  contextWindow?: number;
}

/** 自动发现本地模型（Ollama / vLLM / LM Studio） */
export async function discoverLocalModels(): Promise<DiscoveredLocalModel[]> {
  return request<DiscoveredLocalModel[]>('POST', '/api/models/discover-local', {});
}

// ===================== File Upload API =====================

/** 文件上传结果 */
export interface UploadResult {
  fileId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  size: number;
  url: string;
}

/** 上传文件到服务器（POST /api/upload） */
export async function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `上传失败 (${res.status})`);
  }
  const json = await res.json();
  return json.data ?? json;
}

// ===================== Partners (供应商/客户) API =====================

/** 分页查询客商列表 */
export async function getPartners(params?: {
  type?: PartnerType;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<PartnerListResponse> {
  const query = new URLSearchParams();
  if (params) {
    if (params.type) query.set('type', params.type);
    if (params.search) query.set('search', params.search);
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.pageSize !== undefined) query.set('pageSize', String(params.pageSize));
  }
  const qs = query.toString();
  return request<PartnerListResponse>('GET', `/api/partners${qs ? `?${qs}` : ''}`);
}

/** 获取全部客商（Autocomplete 选项用） */
export async function getAllPartners(type?: PartnerType): Promise<PartnerOption[]> {
  const query = type ? `?type=${encodeURIComponent(type)}` : '';
  return request<PartnerOption[]>('GET', `/api/partners/all${query}`);
}

/** 根据 ID 获取客商详情 */
export async function getPartnerById(id: string): Promise<Partner> {
  return request<Partner>('GET', `/api/partners/${encodeURIComponent(id)}`);
}

/** 创建客商 */
export async function createPartner(
  data: Omit<Partner, 'id' | 'created_at' | 'updated_at'>,
): Promise<Partner> {
  return request<Partner>('POST', '/api/partners', data);
}

/** 更新客商 */
export async function updatePartner(
  id: string,
  data: Partial<Partner>,
): Promise<Partner> {
  return request<Partner>('PUT', `/api/partners/${encodeURIComponent(id)}`, data);
}

/** 删除客商 */
export async function deletePartner(id: string): Promise<void> {
  await request<void>('DELETE', `/api/partners/${encodeURIComponent(id)}`);
}

/** 快速创建客商（仅 name + type），返回轻量选项 */
export async function quickCreatePartner(
  data: QuickCreatePartnerPayload,
): Promise<PartnerOption> {
  return request<PartnerOption>('POST', '/api/partners/quick', data);
}
