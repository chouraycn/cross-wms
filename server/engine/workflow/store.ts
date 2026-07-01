/**
 * 工作流存储模块
 * 使用 SQLite 进行持久化存储，支持版本管理和导入/导出
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger.js';
import { getDb } from '../../db-core.js';
import type {
  Workflow,
  WorkflowVersion,
  WorkflowExecution,
  WorkflowTemplate,
} from './types.js';

/**
 * 工作流存储类
 * 提供工作流的 CRUD 操作、版本管理和导入/导出功能
 */
export class WorkflowStore {
  private db: Database.Database | null = null;

  constructor() {
    this.initTables();
  }

  /**
   * 初始化数据库表
   */
  private initTables(): void {
    try {
      this.db = getDb();

      // 工作流主表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS workflow (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          nodes TEXT NOT NULL,
          triggers TEXT NOT NULL,
          variables TEXT NOT NULL,
          metadata TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'draft',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          created_by TEXT,
          updated_by TEXT
        )
      `);

      // 工作流版本历史表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_version (
          workflow_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          created_by TEXT,
          changes TEXT,
          snapshot TEXT NOT NULL,
          PRIMARY KEY (workflow_id, version),
          FOREIGN KEY (workflow_id) REFERENCES workflow(id)
        )
      `);

      // 工作流执行历史表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_execution (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          workflow_name TEXT NOT NULL,
          status TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          duration INTEGER,
          trigger_type TEXT NOT NULL,
          triggered_by TEXT,
          node_executions TEXT NOT NULL,
          variables TEXT NOT NULL,
          error TEXT,
          logs TEXT NOT NULL,
          FOREIGN KEY (workflow_id) REFERENCES workflow(id)
        )
      `);

      // 工作流模板表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_template (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          category TEXT NOT NULL,
          icon TEXT,
          tags TEXT NOT NULL,
          workflow TEXT NOT NULL,
          usage_count INTEGER DEFAULT 0,
          rating REAL DEFAULT 0
        )
      `);

      logger.info('[WorkflowStore] 数据库表初始化完成');
    } catch (error) {
      logger.error('[WorkflowStore] 初始化失败:', error);
      throw error;
    }
  }

  // ===================== CRUD 操作 =====================

  /**
   * 创建工作流
   * @param workflow 工作流数据
   * @returns 创建的工作流
   */
  create(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Workflow {
    if (!this.db) throw new Error('数据库未初始化');

    const now = Date.now();
    const id = uuidv4();
    const newWorkflow: Workflow = {
      id,
      name: workflow.name,
      description: workflow.description,
      nodes: workflow.nodes,
      triggers: workflow.triggers,
      variables: workflow.variables,
      metadata: workflow.metadata,
      version: 1,
      status: workflow.status || 'draft',
      createdAt: now,
      updatedAt: now,
      createdBy: workflow.createdBy,
      updatedBy: workflow.updatedBy,
    };

    const stmt = this.db.prepare(`
      INSERT INTO workflow (
        id, name, description, nodes, triggers, variables, metadata,
        version, status, created_at, updated_at, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      newWorkflow.name,
      newWorkflow.description,
      JSON.stringify(newWorkflow.nodes),
      JSON.stringify(newWorkflow.triggers),
      JSON.stringify(newWorkflow.variables),
      JSON.stringify(newWorkflow.metadata || {}),
      newWorkflow.version,
      newWorkflow.status,
      newWorkflow.createdAt,
      newWorkflow.updatedAt,
      newWorkflow.createdBy || null,
      newWorkflow.updatedBy || null
    );

    logger.info('[WorkflowStore] 创建工作流:', { id, name: newWorkflow.name });
    return newWorkflow;
  }

  /**
   * 获取单个工作流
   * @param id 工作流 ID
   * @returns 工作流数据
   */
  getById(id: string): Workflow | null {
    if (!this.db) throw new Error('数据库未初始化');

    const stmt = this.db.prepare('SELECT * FROM workflow WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return this.rowToWorkflow(row);
  }

  /**
   * 获取所有工作流
   * @param filters 过滤条件
   * @returns 工作流列表
   */
  getAll(filters?: {
    status?: 'draft' | 'published' | 'archived';
    search?: string;
    category?: string;
  }): Workflow[] {
    if (!this.db) throw new Error('数据库未初始化');

    let sql = 'SELECT * FROM workflow';
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters?.search) {
      conditions.push('name LIKE ? OR description LIKE ?');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY updated_at DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => this.rowToWorkflow(row));
  }

  /**
   * 更新工作流
   * @param id 工作流 ID
   * @param updates 更新数据
   * @param createVersion 是否创建版本
   * @returns 更新后的工作流
   */
  update(
    id: string,
    updates: Partial<Workflow>,
    createVersion: boolean = true
  ): Workflow | null {
    if (!this.db) throw new Error('数据库未初始化');

    const existing = this.getById(id);
    if (!existing) return null;

    const now = Date.now();
    const newVersion = createVersion ? existing.version + 1 : existing.version;

    const updated: Workflow = {
      ...existing,
      ...updates,
      version: newVersion,
      updatedAt: now,
    };

    // 创建版本快照
    if (createVersion && updates.nodes || updates.triggers || updates.variables) {
      this.createVersion(id, existing, updates.updatedBy);
    }

    const stmt = this.db.prepare(`
      UPDATE workflow SET
        name = ?, description = ?, nodes = ?, triggers = ?, variables = ?,
        metadata = ?, version = ?, status = ?, updated_at = ?, updated_by = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.name,
      updated.description,
      JSON.stringify(updated.nodes),
      JSON.stringify(updated.triggers),
      JSON.stringify(updated.variables),
      JSON.stringify(updated.metadata || {}),
      updated.version,
      updated.status,
      updated.updatedAt,
      updated.updatedBy || null,
      id
    );

    logger.info('[WorkflowStore] 更新工作流:', { id, version: newVersion });
    return updated;
  }

  /**
   * 删除工作流
   * @param id 工作流 ID
   * @returns 是否成功删除
   */
  delete(id: string): boolean {
    if (!this.db) throw new Error('数据库未初始化');

    // 先删除版本历史
    const deleteVersions = this.db.prepare('DELETE FROM workflow_version WHERE workflow_id = ?');
    deleteVersions.run(id);

    // 删除执行历史
    const deleteExecutions = this.db.prepare('DELETE FROM workflow_execution WHERE workflow_id = ?');
    deleteExecutions.run(id);

    // 删除工作流
    const stmt = this.db.prepare('DELETE FROM workflow WHERE id = ?');
    const result = stmt.run(id);

    logger.info('[WorkflowStore] 删除工作流:', { id, success: result.changes > 0 });
    return result.changes > 0;
  }

  // ===================== 版本管理 =====================

  /**
   * 创建版本快照
   * @param workflowId 工作流 ID
   * @param snapshot 快照数据
   * @param createdBy 创建者
   * @returns 版本号
   */
  private createVersion(
    workflowId: string,
    snapshot: Workflow,
    createdBy?: string
  ): number {
    if (!this.db) throw new Error('数据库未初始化');

    const stmt = this.db.prepare(`
      INSERT INTO workflow_version (
        workflow_id, version, created_at, created_by, changes, snapshot
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      workflowId,
      snapshot.version,
      Date.now(),
      createdBy || null,
      null,
      JSON.stringify(snapshot)
    );

    logger.info('[WorkflowStore] 创建版本快照:', { workflowId, version: snapshot.version });
    return snapshot.version;
  }

  /**
   * 获取版本历史
   * @param workflowId 工作流 ID
   * @returns 版本列表
   */
  getVersionHistory(workflowId: string): WorkflowVersion[] {
    if (!this.db) throw new Error('数据库未初始化');

    const stmt = this.db.prepare(`
      SELECT * FROM workflow_version
      WHERE workflow_id = ?
      ORDER BY version DESC
    `);

    const rows = stmt.all(workflowId) as any[];

    return rows.map(row => ({
      workflowId: row.workflow_id,
      version: row.version,
      createdAt: row.created_at,
      createdBy: row.created_by,
      changes: row.changes,
      snapshot: JSON.parse(row.snapshot) as Workflow,
    }));
  }

  /**
   * 回滚到指定版本
   * @param workflowId 工作流 ID
   * @param version 目标版本
   * @returns 回滚后的工作流
   */
  rollback(workflowId: string, version: number): Workflow | null {
    if (!this.db) throw new Error('数据库未初始化');

    const stmt = this.db.prepare(`
      SELECT snapshot FROM workflow_version
      WHERE workflow_id = ? AND version = ?
    `);

    const row = stmt.get(workflowId, version) as any;
    if (!row) return null;

    const snapshot = JSON.parse(row.snapshot) as Workflow;
    const now = Date.now();

    const rollbackWorkflow: Workflow = {
      ...snapshot,
      version: snapshot.version + 1,
      updatedAt: now,
      updatedBy: 'rollback',
    };

    // 更新工作流
    this.update(workflowId, rollbackWorkflow, false);

    logger.info('[WorkflowStore] 回滚工作流:', { workflowId, targetVersion: version });
    return rollbackWorkflow;
  }

  // ===================== 执行历史 =====================

  /**
   * 保存执行记录
   * @param execution 执行记录
   */
  saveExecution(execution: WorkflowExecution): void {
    if (!this.db) throw new Error('数据库未初始化');

    const stmt = this.db.prepare(`
      INSERT INTO workflow_execution (
        id, workflow_id, workflow_name, status, start_time, end_time, duration,
        trigger_type, triggered_by, node_executions, variables, error, logs
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      execution.id,
      execution.workflowId,
      execution.workflowName,
      execution.status,
      execution.startTime,
      execution.endTime || null,
      execution.duration || null,
      execution.triggerType,
      execution.triggeredBy || null,
      JSON.stringify(execution.nodeExecutions),
      JSON.stringify(execution.variables),
      execution.error || null,
      JSON.stringify(execution.logs)
    );

    logger.info('[WorkflowStore] 保存执行记录:', { executionId: execution.id });
  }

  /**
   * 获取执行历史
   * @param workflowId 工作流 ID
   * @param limit 限制数量
   * @param offset 偏移量
   * @returns 执行记录列表
   */
  getExecutionHistory(workflowId: string, limit: number = 50, offset: number = 0): WorkflowExecution[] {
    if (!this.db) throw new Error('数据库未初始化');

    const stmt = this.db.prepare(`
      SELECT * FROM workflow_execution
      WHERE workflow_id = ?
      ORDER BY start_time DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(workflowId, limit, offset) as any[];

    return rows.map(row => this.rowToExecution(row));
  }

  /**
   * 获取所有执行历史
   * @param limit 限制数量
   * @param offset 偏移量
   * @returns 执行记录列表
   */
  getAllExecutions(limit: number = 100, offset: number = 0): WorkflowExecution[] {
    if (!this.db) throw new Error('数据库未初始化');

    const stmt = this.db.prepare(`
      SELECT * FROM workflow_execution
      ORDER BY start_time DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(limit, offset) as any[];

    return rows.map(row => this.rowToExecution(row));
  }

  // ===================== 模板管理 =====================

  /**
   * 创建模板
   * @param template 模板数据
   * @returns 创建的模板
   */
  createTemplate(template: Omit<WorkflowTemplate, 'id' | 'usageCount' | 'rating'>): WorkflowTemplate {
    if (!this.db) throw new Error('数据库未初始化');

    const id = uuidv4();
    const newTemplate: WorkflowTemplate = {
      id,
      name: template.name,
      description: template.description,
      category: template.category,
      icon: template.icon,
      tags: template.tags,
      workflow: template.workflow,
      usageCount: 0,
      rating: 0,
    };

    const stmt = this.db.prepare(`
      INSERT INTO workflow_template (
        id, name, description, category, icon, tags, workflow, usage_count, rating
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      newTemplate.name,
      newTemplate.description,
      newTemplate.category,
      newTemplate.icon || null,
      JSON.stringify(newTemplate.tags),
      JSON.stringify(newTemplate.workflow),
      newTemplate.usageCount,
      newTemplate.rating
    );

    logger.info('[WorkflowStore] 创建模板:', { id, name: newTemplate.name });
    return newTemplate;
  }

  /**
   * 获取所有模板
   * @param category 分类过滤
   * @returns 模板列表
   */
  getTemplates(category?: string): WorkflowTemplate[] {
    if (!this.db) throw new Error('数据库未初始化');

    let sql = 'SELECT * FROM workflow_template';
    const params: any[] = [];

    if (category) {
      sql += ' WHERE category = ?';
      params.push(category);
    }

    sql += ' ORDER BY usage_count DESC, rating DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      icon: row.icon,
      tags: JSON.parse(row.tags),
      workflow: JSON.parse(row.workflow),
      usageCount: row.usage_count,
      rating: row.rating,
    }));
  }

  /**
   * 从模板创建工作流
   * @param templateId 模板 ID
   * @param name 工作流名称
   * @param createdBy 创建者
   * @returns 创建的工作流
   */
  createFromTemplate(templateId: string, name: string, createdBy?: string): Workflow | null {
    if (!this.db) throw new Error('数据库未初始化');

    const stmt = this.db.prepare('SELECT * FROM workflow_template WHERE id = ?');
    const row = stmt.get(templateId) as any;

    if (!row) return null;

    const templateWorkflow = JSON.parse(row.workflow);
    const workflow = this.create({
      ...templateWorkflow,
      name,
      createdBy,
    });

    // 更新模板使用次数
    const updateStmt = this.db.prepare(
      'UPDATE workflow_template SET usage_count = usage_count + 1 WHERE id = ?'
    );
    updateStmt.run(templateId);

    logger.info('[WorkflowStore] 从模板创建工作流:', { templateId, workflowId: workflow.id });
    return workflow;
  }

  // ===================== 导入/导出 =====================

  /**
   * 导出工作流
   * @param workflowId 工作流 ID
   * @returns JSON 字符串
   */
  export(workflowId: string): string | null {
    const workflow = this.getById(workflowId);
    if (!workflow) return null;

    const exportData = {
      workflow,
      version: '1.0',
      exportedAt: Date.now(),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 导入工作流
   * @param jsonData JSON 字符串
   * @param createdBy 创建者
   * @returns 导入的工作流
   */
  import(jsonData: string, createdBy?: string): Workflow | null {
    try {
      const importData = JSON.parse(jsonData);
      const workflow = importData.workflow as Workflow;

      const newWorkflow = this.create({
        name: workflow.name,
        description: workflow.description,
        nodes: workflow.nodes,
        triggers: workflow.triggers,
        variables: workflow.variables,
        metadata: workflow.metadata,
        status: 'draft',
        createdBy,
      });

      logger.info('[WorkflowStore] 导入工作流:', { id: newWorkflow.id, name: newWorkflow.name });
      return newWorkflow;
    } catch (error) {
      logger.error('[WorkflowStore] 导入失败:', error);
      return null;
    }
  }

  // ===================== 辅助方法 =====================

  /**
   * 将数据库行转换为 Workflow 对象
   */
  private rowToWorkflow(row: any): Workflow {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      nodes: JSON.parse(row.nodes),
      triggers: JSON.parse(row.triggers),
      variables: JSON.parse(row.variables),
      metadata: JSON.parse(row.metadata),
      version: row.version,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    };
  }

  /**
   * 将数据库行转换为 WorkflowExecution 对象
   */
  private rowToExecution(row: any): WorkflowExecution {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      workflowName: row.workflow_name,
      status: row.status,
      startTime: row.start_time,
      endTime: row.end_time,
      duration: row.duration,
      triggerType: row.trigger_type,
      triggeredBy: row.triggered_by,
      nodeExecutions: JSON.parse(row.node_executions),
      variables: JSON.parse(row.variables),
      error: row.error,
      logs: JSON.parse(row.logs),
    };
  }
}

// 创建全局存储实例
export const workflowStore = new WorkflowStore();