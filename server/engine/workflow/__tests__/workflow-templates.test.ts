/**
 * WorkflowTemplates 单元测试
 *
 * 覆盖：
 * - 预置模板列表完整性（5 个内置模板）
 * - 模板格式验证（必填字段、节点结构、触发器结构）
 * - 模板分类、搜索、评分更新、安装
 *
 * 使用 mock 数据库隔离外部依赖，纯单元测试。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ===================== Mock Logger =====================

vi.mock('../../../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ===================== Mock Database =====================

const { templateStore } = vi.hoisted(() => ({
  templateStore: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../db.js', () => {
  const mockDb = {
    exec: vi.fn(),
    prepare(sql: string) {
      const sqlLower = sql.toLowerCase();

      return {
        run: vi.fn((...params: unknown[]) => {
          // INSERT INTO workflow_templates（使用命名参数对象）
          if (/insert\s+into\s+workflow_templates/i.test(sql)) {
            const row = params[0] as Record<string, unknown>;
            templateStore.push({ ...row });
            return { lastInsertRowid: templateStore.length, changes: 1 };
          }
          // UPDATE workflow_templates SET downloads = downloads + 1
          if (/update\s+workflow_templates\s+set\s+downloads/i.test(sql)) {
            const id = params[0] as string;
            const row = templateStore.find(r => r.id === id);
            if (row) {
              row.downloads = ((row.downloads as number) || 0) + 1;
              return { changes: 1 };
            }
            return { changes: 0 };
          }
          // UPDATE workflow_templates SET rating = ?
          if (/update\s+workflow_templates\s+set\s+rating/i.test(sql)) {
            const [rating, id] = params as [number, string];
            const row = templateStore.find(r => r.id === id);
            if (row) {
              row.rating = rating;
              return { changes: 1 };
            }
            return { changes: 0 };
          }
          return { changes: 0, lastInsertRowid: 0 };
        }),
        get: vi.fn((...params: unknown[]) => {
          // SELECT id FROM workflow_templates WHERE id = ?
          if (/select\s+id\s+from\s+workflow_templates\s+where\s+id/i.test(sql)) {
            return templateStore.find(r => r.id === params[0]) || undefined;
          }
          // SELECT * FROM workflow_templates WHERE id = ?
          if (/select\s+\*\s+from\s+workflow_templates\s+where\s+id/i.test(sql)) {
            return templateStore.find(r => r.id === params[0]) || undefined;
          }
          return undefined;
        }),
        all: vi.fn((...params: unknown[]) => {
          // SELECT * FROM workflow_templates [WHERE ...] ORDER BY ...
          if (/select\s+\*\s+from\s+workflow_templates/i.test(sql)) {
            let result = [...templateStore];

            // 处理过滤参数
            const categoryParams = params.filter(
              p => typeof p === 'string' && !String(p).includes('%')
            );
            const searchParams = params.filter(
              p => typeof p === 'string' && String(p).includes('%')
            );

            if (categoryParams.length > 0) {
              result = result.filter(r => r.category === categoryParams[0]);
            }

            if (searchParams.length > 0) {
              const term = (searchParams[0] as string).replace(/%/g, '');
              result = result.filter(
                r =>
                  String(r.name || '').includes(term) ||
                  String(r.description || '').includes(term)
              );
            }

            // 排序：downloads DESC, rating DESC
            result.sort(
              (a, b) =>
                ((b.downloads as number) || 0) - ((a.downloads as number) || 0) ||
                ((b.rating as number) || 0) - ((a.rating as number) || 0)
            );

            return result;
          }

          // SELECT DISTINCT category FROM workflow_templates
          if (/select\s+distinct\s+category\s+from\s+workflow_templates/i.test(sql)) {
            const categories = [...new Set(templateStore.map(r => r.category as string))];
            return categories.map(c => ({ category: c }));
          }

          return [];
        }),
      };
    },
  };

  return { initDb: () => mockDb };
});

// ===================== 导入被测模块 =====================

import {
  seedBuiltinTemplates,
  getTemplates,
  getTemplateById,
  getTemplateCategories,
  searchTemplates,
  updateTemplateRating,
  installTemplate,
} from '../templates.js';

// ===================== 预期模板 ID =====================

const EXPECTED_TEMPLATE_IDS = [
  'template_daily_report',
  'template_file_change_notify',
  'template_api_sync',
  'template_data_cleanup',
  'template_approval_flow',
];

const EXPECTED_CATEGORIES = ['automation', 'notification', 'integration'];

// ===================== 测试 =====================

describe('WorkflowTemplates', () => {
  beforeEach(() => {
    // 清空模拟数据库
    templateStore.length = 0;
    // 重新播种预置模板
    seedBuiltinTemplates();
  });

  // -------------------- 模板列表完整性 --------------------

  describe('模板列表完整性', () => {
    it('应返回全部 5 个预置模板', () => {
      const templates = getTemplates();
      expect(templates).toHaveLength(5);
    });

    it('应包含所有预期模板 ID', () => {
      const templates = getTemplates();
      const ids = templates.map(t => t.id);
      for (const expectedId of EXPECTED_TEMPLATE_IDS) {
        expect(ids).toContain(expectedId);
      }
    });

    it('getTemplateById 应返回指定模板', () => {
      const template = getTemplateById('template_daily_report');
      expect(template).not.toBeNull();
      expect(template?.name).toBe('每日报告生成');
      expect(template?.category).toBe('automation');
    });

    it('getTemplateById 对不存在的 ID 返回 null', () => {
      const template = getTemplateById('nonexistent_template');
      expect(template).toBeNull();
    });

    it('每日报告生成模板应包含正确的描述', () => {
      const template = getTemplateById('template_daily_report');
      expect(template?.description).toContain('每日库存');
    });

    it('文件变化通知模板应属于 notification 分类', () => {
      const template = getTemplateById('template_file_change_notify');
      expect(template?.category).toBe('notification');
    });

    it('API 数据同步模板应属于 integration 分类', () => {
      const template = getTemplateById('template_api_sync');
      expect(template?.category).toBe('integration');
    });

    it('审批流程模板应包含审批决策节点', () => {
      const template = getTemplateById('template_approval_flow');
      expect(template).not.toBeNull();
      const nodeNames = template!.workflow.nodes.map(n => n.name);
      expect(nodeNames).toContain('审批决策');
    });
  });

  // -------------------- 模板格式验证 --------------------

  describe('模板格式验证', () => {
    it('每个模板都包含必填字段', () => {
      const templates = getTemplates();
      for (const template of templates) {
        expect(template.id).toBeTruthy();
        expect(typeof template.id).toBe('string');
        expect(template.name).toBeTruthy();
        expect(typeof template.name).toBe('string');
        expect(template.description).toBeTruthy();
        expect(typeof template.description).toBe('string');
        expect(template.category).toBeTruthy();
        expect(typeof template.category).toBe('string');
        expect(Array.isArray(template.tags)).toBe(true);
        expect(template.workflow).toBeDefined();
        expect(typeof template.workflow).toBe('object');
      }
    });

    it('每个模板的 tags 应为字符串数组', () => {
      const templates = getTemplates();
      for (const template of templates) {
        expect(Array.isArray(template.tags)).toBe(true);
        for (const tag of template.tags) {
          expect(typeof tag).toBe('string');
          expect(tag.length).toBeGreaterThan(0);
        }
      }
    });

    it('每个模板的 workflow 包含必填字段', () => {
      const templates = getTemplates();
      for (const template of templates) {
        const wf = template.workflow;
        expect(wf.name).toBeTruthy();
        expect(wf.description).toBeTruthy();
        expect(Array.isArray(wf.nodes)).toBe(true);
        expect(wf.nodes.length).toBeGreaterThan(0);
        expect(Array.isArray(wf.triggers)).toBe(true);
        expect(wf.triggers.length).toBeGreaterThan(0);
        expect(Array.isArray(wf.variables)).toBe(true);
        expect(typeof wf.version).toBe('number');
        expect(wf.version).toBeGreaterThan(0);
        expect(wf.status).toBe('published');
      }
    });

    it('每个节点包含必填字段', () => {
      const templates = getTemplates();
      for (const template of templates) {
        for (const node of template.workflow.nodes) {
          expect(node.id).toBeTruthy();
          expect(typeof node.id).toBe('string');
          expect(node.type).toBeTruthy();
          expect(node.name).toBeTruthy();
          expect(node.config).toBeDefined();
          expect(typeof node.config).toBe('object');
          expect(node.position).toBeDefined();
          expect(typeof node.position.x).toBe('number');
          expect(typeof node.position.y).toBe('number');
          expect(Array.isArray(node.connections)).toBe(true);
        }
      }
    });

    it('每个触发器包含必填字段', () => {
      const templates = getTemplates();
      for (const template of templates) {
        for (const trigger of template.workflow.triggers) {
          expect(trigger.id).toBeTruthy();
          expect(trigger.type).toBeTruthy();
          expect(trigger.name).toBeTruthy();
          expect(trigger.config).toBeDefined();
          expect(typeof trigger.config).toBe('object');
          expect(typeof trigger.enabled).toBe('boolean');
          expect(trigger.enabled).toBe(true);
        }
      }
    });

    it('每个工作流至少包含一个 trigger 类型节点', () => {
      const templates = getTemplates();
      for (const template of templates) {
        const triggerNodes = template.workflow.nodes.filter(n => n.type === 'trigger');
        expect(triggerNodes.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('节点 connections 中的 source 和 target 应引用存在的节点 ID', () => {
      const templates = getTemplates();
      for (const template of templates) {
        const nodeIds = new Set(template.workflow.nodes.map(n => n.id));
        for (const node of template.workflow.nodes) {
          for (const conn of node.connections) {
            expect(nodeIds.has(conn.source)).toBe(true);
            expect(nodeIds.has(conn.target)).toBe(true);
          }
        }
      }
    });

    it('变量定义包含必填字段', () => {
      const templates = getTemplates();
      for (const template of templates) {
        for (const variable of template.workflow.variables) {
          expect(variable.id).toBeTruthy();
          expect(variable.name).toBeTruthy();
          expect(variable.type).toBeTruthy();
          expect(['string', 'number', 'boolean', 'object', 'array', 'any']).toContain(variable.type);
          expect(['global', 'local']).toContain(variable.scope);
        }
      }
    });

    it('每个模板包含 author 和 rating', () => {
      const templates = getTemplates();
      for (const template of templates) {
        expect(template.author).toBeTruthy();
        expect(typeof template.rating).toBe('number');
        expect(template.rating).toBeGreaterThanOrEqual(0);
        expect(template.rating).toBeLessThanOrEqual(5);
      }
    });
  });

  // -------------------- 模板分类 --------------------

  describe('模板分类', () => {
    it('应返回所有唯一分类', () => {
      const categories = getTemplateCategories();
      expect(categories).toHaveLength(EXPECTED_CATEGORIES.length);
      for (const category of EXPECTED_CATEGORIES) {
        expect(categories).toContain(category);
      }
    });

    it('按分类过滤应返回对应模板', () => {
      const automationTemplates = getTemplates({ category: 'automation' });
      expect(automationTemplates.length).toBe(3); // daily_report, data_cleanup, approval_flow
      for (const t of automationTemplates) {
        expect(t.category).toBe('automation');
      }
    });

    it('按 notification 分类过滤应返回 1 个模板', () => {
      const notificationTemplates = getTemplates({ category: 'notification' });
      expect(notificationTemplates).toHaveLength(1);
      expect(notificationTemplates[0].id).toBe('template_file_change_notify');
    });

    it('按 integration 分类过滤应返回 1 个模板', () => {
      const integrationTemplates = getTemplates({ category: 'integration' });
      expect(integrationTemplates).toHaveLength(1);
      expect(integrationTemplates[0].id).toBe('template_api_sync');
    });
  });

  // -------------------- 模板搜索 --------------------

  describe('模板搜索', () => {
    it('应按名称关键词搜索', () => {
      const results = searchTemplates('报告');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.name.includes('报告'))).toBe(true);
    });

    it('应按描述关键词搜索', () => {
      const results = searchTemplates('审批');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.description.includes('审批'))).toBe(true);
    });

    it('无匹配结果时返回空数组', () => {
      const results = searchTemplates('不存在的关键词xyz');
      expect(results).toHaveLength(0);
    });

    it('搜索 "数据" 应匹配多个模板', () => {
      const results = searchTemplates('数据');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // -------------------- 模板评分 --------------------

  describe('模板评分', () => {
    it('应接受有效评分 0-5', () => {
      expect(updateTemplateRating('template_daily_report', 0)).toBe(true);
      expect(updateTemplateRating('template_daily_report', 3)).toBe(true);
      expect(updateTemplateRating('template_daily_report', 5)).toBe(true);
    });

    it('应拒绝小于 0 的评分', () => {
      expect(updateTemplateRating('template_daily_report', -1)).toBe(false);
    });

    it('应拒绝大于 5 的评分', () => {
      expect(updateTemplateRating('template_daily_report', 6)).toBe(false);
    });

    it('对不存在的模板更新评分应返回 false', () => {
      expect(updateTemplateRating('nonexistent', 3)).toBe(false);
    });

    it('更新评分后应反映新值', () => {
      updateTemplateRating('template_daily_report', 2);
      const template = getTemplateById('template_daily_report');
      expect(template?.rating).toBe(2);
    });
  });

  // -------------------- 模板安装 --------------------

  describe('installTemplate', () => {
    it('应安装模板并返回新工作流', () => {
      const workflow = installTemplate('template_daily_report');
      expect(workflow).not.toBeNull();
      expect(workflow!.id).toMatch(/^wf_/);
      expect(workflow!.name).toBe('每日报告生成');
      expect(workflow!.status).toBe('draft');
      expect(workflow!.nodes).toHaveLength(4);
      expect(workflow!.triggers).toHaveLength(1);
      expect(workflow!.createdAt).toBeGreaterThan(0);
      expect(workflow!.updatedAt).toBeGreaterThan(0);
    });

    it('安装后模板下载计数应增加', () => {
      const before = getTemplateById('template_daily_report');
      const beforeDownloads = before?.downloads || 0;

      installTemplate('template_daily_report');

      const after = getTemplateById('template_daily_report');
      expect(after?.downloads).toBe(beforeDownloads + 1);
    });

    it('安装不存在的模板应返回 null', () => {
      const workflow = installTemplate('nonexistent_template');
      expect(workflow).toBeNull();
    });

    it('安装的工作流应为 draft 状态', () => {
      const workflow = installTemplate('template_api_sync');
      expect(workflow?.status).toBe('draft');
    });
  });

  // -------------------- 下载排序验证 --------------------

  describe('下载排序', () => {
    it('安装模板后应影响排序', () => {
      // 安装 api_sync 模板多次以增加下载量
      installTemplate('template_api_sync');
      installTemplate('template_api_sync');

      const templates = getTemplates();
      const apiSyncIndex = templates.findIndex(t => t.id === 'template_api_sync');
      const dailyReportIndex = templates.findIndex(t => t.id === 'template_daily_report');

      // api_sync 下载量更高，应排在前面（或相同 rating 时）
      expect(apiSyncIndex).toBeLessThanOrEqual(dailyReportIndex);
    });
  });
});
