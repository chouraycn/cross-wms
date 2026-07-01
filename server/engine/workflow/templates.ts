/**
 * 工作流模板存储 — 预置模板和模板市场
 */

import type { WorkflowTemplate, Workflow, WorkflowNode, WorkflowTrigger, WorkflowVariable } from './types.js';
import { initDb } from '../../db.js';
import type Database from 'better-sqlite3';
import { logger } from '../../logger.js';

// ===================== Types =====================

export interface WorkflowTemplateRow {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string | null;
  tags: string; // JSON
  workflow: string; // JSON
  author: string | null;
  downloads: number;
  rating: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateFilter {
  category?: string;
  tags?: string[];
  search?: string;
}

// ===================== JSON Helpers =====================

function serializeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// ===================== Row ↔ Data Mapper =====================

function rowToTemplate(row: WorkflowTemplateRow): WorkflowTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    icon: row.icon ?? undefined,
    tags: (parseJson(row.tags) as unknown as string[]) ?? [],
    workflow: parseJson(row.workflow) as Omit<Workflow, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
    author: row.author ?? undefined,
    downloads: row.downloads,
    rating: row.rating,
  };
}

// ===================== DB Helper =====================

function db(): Database.Database {
  return initDb();
}

// ===================== Table Initialization =====================

let tablesInitialized = false;

export function initTemplateTables(): void {
  if (tablesInitialized) return;

  const database = db();
  database.exec(`
    CREATE TABLE IF NOT EXISTS workflow_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      icon TEXT,
      tags TEXT,
      workflow TEXT NOT NULL,
      author TEXT,
      downloads INTEGER DEFAULT 0,
      rating INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_templates_category ON workflow_templates(category);
    CREATE INDEX IF NOT EXISTS idx_workflow_templates_downloads ON workflow_templates(downloads);
    CREATE INDEX IF NOT EXISTS idx_workflow_templates_rating ON workflow_templates(rating);
  `);

  tablesInitialized = true;
  logger.info('[WorkflowTemplates] 表初始化完成');
}

// ===================== 预置模板定义 =====================

const BUILTIN_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'template_daily_report',
    name: '每日报告生成',
    description: '自动生成每日库存、订单、异常汇总报告，并发送至指定邮箱',
    category: 'automation',
    tags: ['报告', '定时', '通知'],
    workflow: {
      name: '每日报告生成',
      description: '自动生成每日库存、订单、异常汇总报告',
      nodes: [
        {
          id: 'node_trigger',
          type: 'trigger',
          name: '定时触发',
          config: { type: 'schedule', schedule: { cron: '0 8 * * *' } },
          position: { x: 100, y: 100 },
          connections: [{ source: 'node_trigger', target: 'node_collect' }],
        },
        {
          id: 'node_collect',
          type: 'action',
          name: '数据收集',
          config: { type: 'ai_call', params: { prompt: '收集昨日库存变化、订单数量、异常事件数据' } },
          position: { x: 300, y: 100 },
          connections: [{ source: 'node_collect', target: 'node_generate' }],
        },
        {
          id: 'node_generate',
          type: 'action',
          name: '生成报告',
          config: { type: 'ai_call', params: { prompt: '生成结构化报告文本' } },
          position: { x: 500, y: 100 },
          connections: [{ source: 'node_generate', target: 'node_send' }],
        },
        {
          id: 'node_send',
          type: 'action',
          name: '发送通知',
          config: { type: 'notification', params: { channel: 'email', recipients: [] } },
          position: { x: 700, y: 100 },
          connections: [],
        },
      ],
      triggers: [{ id: 'trigger_daily', type: 'schedule', name: '每日 8 点', config: { type: 'schedule', schedule: { cron: '0 8 * * *' } }, enabled: true }],
      variables: [{ id: 'var_recipients', name: 'recipients', type: 'array', scope: 'global', required: true }],
      version: 1,
      status: 'published',
    },
    author: 'CDF Know Clow',
    downloads: 0,
    rating: 5,
  },
  {
    id: 'template_file_change_notify',
    name: '文件变化通知',
    description: '监控指定文件夹变化，自动发送通知消息',
    category: 'notification',
    tags: ['文件', '监控', '通知'],
    workflow: {
      name: '文件变化通知',
      description: '监控文件夹变化并发送通知',
      nodes: [
        {
          id: 'node_trigger',
          type: 'trigger',
          name: '文件事件',
          config: { type: 'event', event: { eventName: 'file.changed' } },
          position: { x: 100, y: 100 },
          connections: [{ source: 'node_trigger', target: 'node_filter' }],
        },
        {
          id: 'node_filter',
          type: 'condition',
          name: '类型过滤',
          config: { conditions: [{ variable: 'eventType', operator: 'contains', value: 'modify' }], logic: 'and' },
          position: { x: 300, y: 100 },
          connections: [{ source: 'node_filter', target: 'node_notify', condition: 'true' }],
        },
        {
          id: 'node_notify',
          type: 'action',
          name: '发送通知',
          config: { type: 'notification', params: { channel: 'wecom', message: '文件 {{fileName}} 发生变化' } },
          position: { x: 500, y: 100 },
          connections: [],
        },
      ],
      triggers: [{ id: 'trigger_file', type: 'event', name: '文件变化', config: { type: 'event', event: { eventName: 'file.changed' } }, enabled: true }],
      variables: [{ id: 'var_path', name: 'watchPath', type: 'string', scope: 'global', required: true }],
      version: 1,
      status: 'published',
    },
    author: 'CDF Know Clow',
    downloads: 0,
    rating: 4,
  },
  {
    id: 'template_api_sync',
    name: 'API 数据同步',
    description: '定时从外部 API 同步数据到本地数据库',
    category: 'integration',
    tags: ['API', '同步', '数据'],
    workflow: {
      name: 'API 数据同步',
      description: '定时同步外部 API 数据',
      nodes: [
        {
          id: 'node_trigger',
          type: 'trigger',
          name: '定时触发',
          config: { type: 'schedule', schedule: { cron: '0 */6 * * *' } },
          position: { x: 100, y: 100 },
          connections: [{ source: 'node_trigger', target: 'node_fetch' }],
        },
        {
          id: 'node_fetch',
          type: 'action',
          name: '获取数据',
          config: { type: 'api_call', params: { url: '', method: 'GET' } },
          position: { x: 300, y: 100 },
          connections: [{ source: 'node_fetch', target: 'node_transform' }],
        },
        {
          id: 'node_transform',
          type: 'action',
          name: '数据转换',
          config: { type: 'data_transform', params: { mapping: {} } },
          position: { x: 500, y: 100 },
          connections: [{ source: 'node_transform', target: 'node_save' }],
        },
        {
          id: 'node_save',
          type: 'action',
          name: '保存数据',
          config: { type: 'script', params: { code: 'db.insert(data)' } },
          position: { x: 700, y: 100 },
          connections: [],
        },
      ],
      triggers: [{ id: 'trigger_sync', type: 'schedule', name: '每 6 小时', config: { type: 'schedule', schedule: { cron: '0 */6 * * *' } }, enabled: true }],
      variables: [
        { id: 'var_url', name: 'apiUrl', type: 'string', scope: 'global', required: true },
        { id: 'var_mapping', name: 'fieldMapping', type: 'object', scope: 'global' },
      ],
      version: 1,
      status: 'published',
    },
    author: 'CDF Know Clow',
    downloads: 0,
    rating: 4,
  },
  {
    id: 'template_data_cleanup',
    name: '定时数据清理',
    description: '定期清理过期数据、日志文件、临时文件',
    category: 'automation',
    tags: ['清理', '定时', '维护'],
    workflow: {
      name: '定时数据清理',
      description: '定期清理过期数据',
      nodes: [
        {
          id: 'node_trigger',
          type: 'trigger',
          name: '定时触发',
          config: { type: 'schedule', schedule: { cron: '0 2 * * 0' } },
          position: { x: 100, y: 100 },
          connections: [{ source: 'node_trigger', target: 'node_scan' }],
        },
        {
          id: 'node_scan',
          type: 'action',
          name: '扫描过期数据',
          config: { type: 'ai_call', params: { prompt: '查找超过 {{retentionDays}} 天的数据' } },
          position: { x: 300, y: 100 },
          connections: [{ source: 'node_scan', target: 'node_delete' }],
        },
        {
          id: 'node_delete',
          type: 'action',
          name: '删除数据',
          config: { type: 'script', params: { code: 'for (item of expiredItems) { db.delete(item.id) }' } },
          position: { x: 500, y: 100 },
          connections: [{ source: 'node_delete', target: 'node_log' }],
        },
        {
          id: 'node_log',
          type: 'action',
          name: '记录日志',
          config: { type: 'notification', params: { channel: 'log', message: '清理完成：删除 {{count}} 条记录' } },
          position: { x: 700, y: 100 },
          connections: [],
        },
      ],
      triggers: [{ id: 'trigger_cleanup', type: 'schedule', name: '每周日凌晨 2 点', config: { type: 'schedule', schedule: { cron: '0 2 * * 0' } }, enabled: true }],
      variables: [{ id: 'var_days', name: 'retentionDays', type: 'number', scope: 'global', defaultValue: 30 }],
      version: 1,
      status: 'published',
    },
    author: 'CDF Know Clow',
    downloads: 0,
    rating: 3,
  },
  {
    id: 'template_approval_flow',
    name: '审批流程自动化',
    description: '自动化审批流程：提交申请、审批处理、结果通知',
    category: 'automation',
    tags: ['审批', '流程', '通知'],
    workflow: {
      name: '审批流程自动化',
      description: '自动化审批处理流程',
      nodes: [
        {
          id: 'node_trigger',
          type: 'trigger',
          name: '申请提交',
          config: { type: 'event', event: { eventName: 'approval.submitted' } },
          position: { x: 100, y: 100 },
          connections: [{ source: 'node_trigger', target: 'node_analyze' }],
        },
        {
          id: 'node_analyze',
          type: 'action',
          name: 'AI 分析',
          config: { type: 'ai_call', params: { prompt: '分析申请内容，判断是否符合审批规则' } },
          position: { x: 300, y: 100 },
          connections: [{ source: 'node_analyze', target: 'node_decide' }],
        },
        {
          id: 'node_decide',
          type: 'condition',
          name: '审批决策',
          config: { conditions: [{ variable: 'analysisResult', operator: 'equals', value: 'approved' }], logic: 'and' },
          position: { x: 500, y: 100 },
          connections: [
            { source: 'node_decide', target: 'node_notify_approved', condition: 'true' },
            { source: 'node_decide', target: 'node_notify_rejected', condition: 'false' },
          ],
        },
        {
          id: 'node_notify_approved',
          type: 'action',
          name: '通知通过',
          config: { type: 'notification', params: { channel: 'wecom', message: '审批通过' } },
          position: { x: 700, y: 50 },
          connections: [],
        },
        {
          id: 'node_notify_rejected',
          type: 'action',
          name: '通知拒绝',
          config: { type: 'notification', params: { channel: 'wecom', message: '审批拒绝：{{reason}}' } },
          position: { x: 700, y: 150 },
          connections: [],
        },
      ],
      triggers: [{ id: 'trigger_approval', type: 'event', name: '审批申请', config: { type: 'event', event: { eventName: 'approval.submitted' } }, enabled: true }],
      variables: [],
      version: 1,
      status: 'published',
    },
    author: 'CDF Know Clow',
    downloads: 0,
    rating: 5,
  },
];

// ===================== CRUD Operations =====================

/**
 * 初始化预置模板
 */
export function seedBuiltinTemplates(): void {
  initTemplateTables();

  for (const template of BUILTIN_TEMPLATES) {
    const existing = db().prepare('SELECT id FROM workflow_templates WHERE id = ?').get(template.id);
    if (!existing) {
      const now = new Date().toISOString();
      const row: WorkflowTemplateRow = {
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        icon: template.icon ?? null,
        tags: serializeJson(template.tags),
        workflow: serializeJson(template.workflow),
        author: template.author ?? null,
        downloads: template.downloads ?? 0,
        rating: template.rating ?? 0,
        created_at: now,
        updated_at: now,
      };

      db().prepare(`
        INSERT INTO workflow_templates (
          id, name, description, category, icon, tags, workflow, author, downloads, rating, created_at, updated_at
        ) VALUES (
          @id, @name, @description, @category, @icon, @tags, @workflow, @author, @downloads, @rating, @created_at, @updated_at
        )
      `).run(row);

      logger.info(`[WorkflowTemplates] 预置模板 ${template.id} 已插入`);
    }
  }
}

/**
 * 获取模板列表
 */
export function getTemplates(filter?: TemplateFilter): WorkflowTemplate[] {
  initTemplateTables();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter?.category) {
    conditions.push('category = ?');
    params.push(filter.category);
  }

  if (filter?.search) {
    conditions.push('name LIKE ? OR description LIKE ?');
    params.push(`%${filter.search}%`, `%${filter.search}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db().prepare(`
    SELECT * FROM workflow_templates ${whereClause} ORDER BY downloads DESC, rating DESC
  `).all(...params) as WorkflowTemplateRow[];

  return rows.map(rowToTemplate);
}

/**
 * 获取单条模板详情
 */
export function getTemplateById(id: string): WorkflowTemplate | null {
  initTemplateTables();

  const row = db().prepare('SELECT * FROM workflow_templates WHERE id = ?').get(id) as WorkflowTemplateRow | undefined;
  return row ? rowToTemplate(row) : null;
}

/**
 * 安装模板（创建工作流）
 */
export function installTemplate(templateId: string): Workflow | null {
  initTemplateTables();

  const template = getTemplateById(templateId);
  if (!template) return null;

  // 更新下载计数
  db().prepare('UPDATE workflow_templates SET downloads = downloads + 1 WHERE id = ?').run(templateId);

  // 创建工作流（分配新 ID）
  const workflowId = 'wf_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const now = Date.now();

  const workflow: Workflow = {
    ...template.workflow,
    id: workflowId,
    createdAt: now,
    updatedAt: now,
    status: 'draft', // 安装后为草稿状态，需用户手动发布
  };

  return workflow;
}

/**
 * 获取模板分类列表
 */
export function getTemplateCategories(): string[] {
  initTemplateTables();

  const rows = db().prepare('SELECT DISTINCT category FROM workflow_templates').all() as { category: string }[];
  return rows.map(r => r.category);
}

/**
 * 搜索模板
 */
export function searchTemplates(query: string): WorkflowTemplate[] {
  return getTemplates({ search: query });
}

/**
 * 更新模板评分
 */
export function updateTemplateRating(templateId: string, rating: number): boolean {
  initTemplateTables();

  if (rating < 0 || rating > 5) return false;

  const result = db().prepare('UPDATE workflow_templates SET rating = ? WHERE id = ?').run(rating, templateId);
  return result.changes > 0;
}