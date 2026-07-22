import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  registerTemplate,
  getTemplate,
  listTemplates,
  clearTemplates,
  validateTemplateVariables,
  createSkillFromTemplate,
  exportTemplate,
  getBuiltinTemplates,
  initializeBuiltinTemplates,
  type SkillTemplate,
} from '../lifecycle/template-manager.js';

describe('TemplateManager', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'template-manager-'));
    vi.clearAllMocks();
    clearTemplates();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    clearTemplates();
  });

  describe('registerTemplate & getTemplate', () => {
    it('应该注册并获取模板', () => {
      const template: SkillTemplate = {
        id: 'test-template',
        name: 'Test Template',
        description: 'Test',
        category: 'general',
        tags: ['test'],
        files: [],
        variables: [],
      };

      registerTemplate(template);
      const result = getTemplate('test-template');

      expect(result).toEqual(template);
    });

    it('获取不存在的模板应返回 undefined', () => {
      const result = getTemplate('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('listTemplates', () => {
    it('应该列出所有模板', () => {
      const template1: SkillTemplate = {
        id: 'template-1',
        name: 'Template 1',
        description: 'Test',
        category: 'general',
        tags: ['test'],
        files: [],
        variables: [],
      };
      const template2: SkillTemplate = {
        id: 'template-2',
        name: 'Template 2',
        description: 'Test',
        category: 'api',
        tags: ['test'],
        files: [],
        variables: [],
      };

      registerTemplate(template1);
      registerTemplate(template2);

      const result = listTemplates();
      expect(result.length).toBe(2);
    });

    it('应该按分类筛选模板', () => {
      const template1: SkillTemplate = {
        id: 'template-1',
        name: 'Template 1',
        description: 'Test',
        category: 'general',
        tags: ['test'],
        files: [],
        variables: [],
      };
      const template2: SkillTemplate = {
        id: 'template-2',
        name: 'Template 2',
        description: 'Test',
        category: 'api',
        tags: ['test'],
        files: [],
        variables: [],
      };

      registerTemplate(template1);
      registerTemplate(template2);

      const result = listTemplates('api');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('template-2');
    });
  });

  describe('validateTemplateVariables', () => {
    it('应该验证必填变量', () => {
      const template: SkillTemplate = {
        id: 'test-validate',
        name: 'Test',
        description: 'Test',
        category: 'general',
        tags: ['test'],
        files: [],
        variables: [
          {
            name: 'requiredVar',
            type: 'string',
            label: 'Required',
            description: 'Required',
            required: true,
          },
        ],
      };

      registerTemplate(template);

      const result = validateTemplateVariables('test-validate', {});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
    });

    it('应该验证变量类型', () => {
      const template: SkillTemplate = {
        id: 'test-type',
        name: 'Test',
        description: 'Test',
        category: 'general',
        tags: ['test'],
        files: [],
        variables: [
          {
            name: 'numVar',
            type: 'number',
            label: 'Number',
            description: 'Number',
            required: true,
          },
        ],
      };

      registerTemplate(template);

      const result = validateTemplateVariables('test-type', { numVar: 'not-a-number' });
      expect(result.valid).toBe(false);
    });

    it('应该验证 select 选项', () => {
      const template: SkillTemplate = {
        id: 'test-select',
        name: 'Test',
        description: 'Test',
        category: 'general',
        tags: ['test'],
        files: [],
        variables: [
          {
            name: 'selectVar',
            type: 'select',
            label: 'Select',
            description: 'Select',
            required: true,
            options: ['option1', 'option2'],
          },
        ],
      };

      registerTemplate(template);

      const result = validateTemplateVariables('test-select', { selectVar: 'invalid' });
      expect(result.valid).toBe(false);
    });

    it('有效的变量应通过验证', () => {
      const template: SkillTemplate = {
        id: 'test-valid',
        name: 'Test',
        description: 'Test',
        category: 'general',
        tags: ['test'],
        files: [],
        variables: [
          {
            name: 'strVar',
            type: 'string',
            label: 'String',
            description: 'String',
            required: true,
          },
          {
            name: 'numVar',
            type: 'number',
            label: 'Number',
            description: 'Number',
            required: false,
          },
        ],
      };

      registerTemplate(template);

      const result = validateTemplateVariables('test-valid', { strVar: 'hello', numVar: 42 });
      expect(result.valid).toBe(true);
    });
  });

  describe('createSkillFromTemplate', () => {
    it('应该使用模板创建技能文件', async () => {
      const template: SkillTemplate = {
        id: 'test-create',
        name: 'Test',
        description: 'Test',
        category: 'general',
        tags: ['test'],
        files: [
          {
            path: 'SKILL.md',
            content: 'name: {{skillName}}\ndescription: {{skillDescription}}',
            template: true,
          },
          {
            path: 'index.ts',
            content: 'export const name = "{{skillName}}";',
            template: true,
          },
        ],
        variables: [
          {
            name: 'skillName',
            type: 'string',
            label: 'Skill Name',
            description: 'Name',
            required: true,
          },
          {
            name: 'skillDescription',
            type: 'string',
            label: 'Description',
            description: 'Description',
            required: true,
          },
        ],
      };

      registerTemplate(template);

      const targetDir = path.join(tmpRoot, 'my-skill');
      const result = await createSkillFromTemplate('test-create', {
        skillName: 'my-skill',
        skillDescription: 'My Skill',
      }, targetDir);

      expect(result.success).toBe(true);
      expect(result.skillDir).toBe(targetDir);

      const skillMdContent = fs.readFileSync(path.join(targetDir, 'SKILL.md'), 'utf-8');
      expect(skillMdContent).toContain('name: my-skill');
      expect(skillMdContent).toContain('description: My Skill');

      const indexTsContent = fs.readFileSync(path.join(targetDir, 'index.ts'), 'utf-8');
      expect(indexTsContent).toContain('export const name = "my-skill";');
    });

    it('应该应用默认值', async () => {
      const template: SkillTemplate = {
        id: 'test-default',
        name: 'Test',
        description: 'Test',
        category: 'general',
        tags: ['test'],
        files: [
          {
            path: 'SKILL.md',
            content: 'category: {{skillCategory}}',
            template: true,
          },
        ],
        variables: [
          {
            name: 'skillCategory',
            type: 'select',
            label: 'Category',
            description: 'Category',
            required: false,
            default: 'general',
            options: ['general', 'api', 'tools'],
          },
        ],
      };

      registerTemplate(template);

      const targetDir = path.join(tmpRoot, 'my-skill');
      const result = await createSkillFromTemplate('test-default', {}, targetDir);

      expect(result.success).toBe(true);

      const skillMdContent = fs.readFileSync(path.join(targetDir, 'SKILL.md'), 'utf-8');
      expect(skillMdContent).toContain('category: general');
    });

    it('无效变量应返回错误', async () => {
      const template: SkillTemplate = {
        id: 'test-invalid',
        name: 'Test',
        description: 'Test',
        category: 'general',
        tags: ['test'],
        files: [],
        variables: [
          {
            name: 'requiredVar',
            type: 'string',
            label: 'Required',
            description: 'Required',
            required: true,
          },
        ],
      };

      registerTemplate(template);

      const result = await createSkillFromTemplate('test-invalid', {}, tmpRoot);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('exportTemplate', () => {
    it('应该导出技能为模板', async () => {
      const skillDir = path.join(tmpRoot, 'my-skill');
      fs.mkdirSync(skillDir, { recursive: true });

      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: my-skill
description: My Skill
category: general
tags: my-skill, general
---

# My Skill

Description
`, 'utf-8');

      fs.writeFileSync(path.join(skillDir, 'index.ts'), 'export const name = "{{skillName}}";', 'utf-8');

      const result = await exportTemplate(skillDir);

      expect(result.success).toBe(true);
      expect(result.template).toBeDefined();
      expect(result.template?.name).toBe('my-skill');
      expect(result.template?.variables.length).toBe(1);
      expect(result.template?.variables[0].name).toBe('skillName');
    });
  });

  describe('getBuiltinTemplates', () => {
    it('应该返回内置模板列表', () => {
      const templates = getBuiltinTemplates();
      expect(templates.length).toBe(5);

      const templateIds = templates.map((t) => t.id);
      expect(templateIds).toContain('basic');
      expect(templateIds).toContain('mcp-server');
      expect(templateIds).toContain('cli-tool');
      expect(templateIds).toContain('web-api');
      expect(templateIds).toContain('data-processor');
    });

    it('内置模板应包含正确的变量和文件', () => {
      const templates = getBuiltinTemplates();
      const basicTemplate = templates.find((t) => t.id === 'basic');

      expect(basicTemplate).toBeDefined();
      expect(basicTemplate?.variables.length).toBe(3);
      expect(basicTemplate?.files.length).toBe(2);
    });
  });

  describe('initializeBuiltinTemplates', () => {
    it('应该初始化内置模板', () => {
      initializeBuiltinTemplates();

      const basic = getTemplate('basic');
      const mcpServer = getTemplate('mcp-server');

      expect(basic).toBeDefined();
      expect(mcpServer).toBeDefined();
    });
  });
});
