import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  generateSkillDocs,
  generateAllDocs,
  generateApiReference,
  generateSkillIndex,
  formatDocAsMarkdown,
  formatDocAsHtml,
  formatDocAsJson,
  saveDoc,
  saveAllDocs,
  type SkillDocumentation,
} from '../docs/index.js';

describe('Docs Generator', () => {
  let tempDir: string;
  let skillDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-test-'));
    skillDir = path.join(tempDir, 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });

    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: test-skill
description: 测试技能
version: 1.0.0
author: Test Author
---

# Test Skill

测试技能描述

## 使用示例

\`\`\`
输入示例
\`\`\`
`);

    fs.writeFileSync(path.join(skillDir, 'index.ts'), `import { logger } from '../../logger.js';

export function testFunction(params: Record<string, unknown>): Record<string, unknown> {
  logger.debug('[test-skill] testFunction called');
  return { success: true };
}

export default {
  name: 'test-skill',
  description: '测试技能',
  tools: [
    {
      name: 'test_tool',
      description: '测试工具',
      handler: (args: Record<string, unknown>) => testFunction(args),
    },
  ],
};
`);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('generateSkillDocs', () => {
    it('应该生成技能文档', () => {
      const doc = generateSkillDocs(skillDir);

      expect(doc.skillName).toBe('test-skill');
      expect(doc.description).toBe('测试技能');
      expect(doc.version).toBe('1.0.0');
      expect(doc.author).toBe('Test Author');
    });

    it('应该提取工具函数', () => {
      const doc = generateSkillDocs(skillDir);

      expect(doc.tools).toHaveLength(1);
      expect(doc.tools[0].name).toBe('test_tool');
      expect(doc.tools[0].description).toBe('测试工具');
    });

    it('应该提取使用示例', () => {
      const doc = generateSkillDocs(skillDir);

      expect(doc.examples).toHaveLength(1);
      expect(doc.examples[0].input).toBe('输入示例');
    });

    it('应该在配置中排除示例', () => {
      const doc = generateSkillDocs(skillDir, { includeExamples: false });

      expect(doc.examples).toHaveLength(0);
    });
  });

  describe('generateAllDocs', () => {
    it('应该生成所有技能文档', () => {
      const docs = generateAllDocs(tempDir);

      expect(docs).toHaveLength(1);
      expect(docs[0].skillName).toBe('test-skill');
    });

    it('应该处理不存在的目录', () => {
      const docs = generateAllDocs('/nonexistent-directory');

      expect(docs).toHaveLength(0);
    });
  });

  describe('generateApiReference', () => {
    it('应该生成 API 参考', () => {
      const apiRef = generateApiReference(skillDir);

      expect(apiRef).toBeDefined();
      expect(apiRef?.endpoints).toBeDefined();
    });
  });

  describe('generateSkillIndex', () => {
    it('应该生成技能索引', () => {
      const index = generateSkillIndex(tempDir);

      expect(index).toContain('test-skill');
      expect(index).toContain('测试技能');
    });
  });

  describe('formatDocAsMarkdown', () => {
    it('应该格式化为 Markdown', () => {
      const doc: SkillDocumentation = {
        skillName: 'test-skill',
        description: '测试描述',
        version: '1.0.0',
        author: 'Test Author',
        tools: [],
        commands: [],
        examples: [],
      };

      const md = formatDocAsMarkdown(doc);

      expect(md).toContain('# test-skill');
      expect(md).toContain('测试描述');
      expect(md).toContain('**版本**: 1.0.0');
    });
  });

  describe('formatDocAsJson', () => {
    it('应该格式化为 JSON', () => {
      const doc: SkillDocumentation = {
        skillName: 'test-skill',
        description: '测试描述',
        version: '1.0.0',
        tools: [],
        commands: [],
        examples: [],
      };

      const json = formatDocAsJson(doc);
      const parsed = JSON.parse(json);

      expect(parsed.skillName).toBe('test-skill');
      expect(parsed.description).toBe('测试描述');
    });
  });

  describe('formatDocAsHtml', () => {
    it('应该格式化为 HTML', () => {
      const doc: SkillDocumentation = {
        skillName: 'test-skill',
        description: '测试描述',
        version: '1.0.0',
        tools: [],
        commands: [],
        examples: [],
      };

      const html = formatDocAsHtml(doc);

      expect(html).toContain('<h1>test-skill</h1>');
      expect(html).toContain('测试描述');
    });
  });

  describe('saveDoc', () => {
    it('应该保存 Markdown 文档', async () => {
      const doc: SkillDocumentation = {
        skillName: 'test-skill',
        description: '测试描述',
        version: '1.0.0',
        tools: [],
        commands: [],
        examples: [],
      };

      const outputDir = path.join(tempDir, 'output');
      await saveDoc(doc, { outputDir, format: 'markdown' });

      const filePath = path.join(outputDir, 'test-skill.md');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toContain('# test-skill');
    });

    it('应该保存 HTML 文档', async () => {
      const doc: SkillDocumentation = {
        skillName: 'test-skill',
        description: '测试描述',
        version: '1.0.0',
        tools: [],
        commands: [],
        examples: [],
      };

      const outputDir = path.join(tempDir, 'output');
      await saveDoc(doc, { outputDir, format: 'html' });

      const filePath = path.join(outputDir, 'test-skill.html');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toContain('<h1>test-skill</h1>');
    });

    it('应该保存 JSON 文档', async () => {
      const doc: SkillDocumentation = {
        skillName: 'test-skill',
        description: '测试描述',
        version: '1.0.0',
        tools: [],
        commands: [],
        examples: [],
      };

      const outputDir = path.join(tempDir, 'output');
      await saveDoc(doc, { outputDir, format: 'json' });

      const filePath = path.join(outputDir, 'test-skill.json');
      expect(fs.existsSync(filePath)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(parsed.skillName).toBe('test-skill');
    });
  });

  describe('saveAllDocs', () => {
    it('应该保存所有文档和索引', async () => {
      const outputDir = path.join(tempDir, 'docs');
      await saveAllDocs(tempDir, { outputDir, format: 'markdown' });

      expect(fs.existsSync(path.join(outputDir, 'test-skill.md'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'index.md'))).toBe(true);
    });
  });
});
