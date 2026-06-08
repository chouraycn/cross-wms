/**
 * SKILL.md 解析器单元测试
 *
 * 覆盖：
 * - splitFrontmatterAndBody: frontmatter 分离
 * - parseFrontmatter: YAML 解析
 * - extractInstructionBlocks: instruction block 提取
 * - inferDescription: 描述推断
 * - inferTrigger: 触发词推断
 * - parseSkillMd: 完整解析流程（含错误处理）
 * - mapParsedToSkillFields: 字段映射
 */

import { describe, it, expect } from 'vitest';
import {
  splitFrontmatterAndBody,
  parseFrontmatter,
  extractInstructionBlocks,
  inferDescription,
  inferTrigger,
  parseSkillMd,
  mapParsedToSkillFields,
} from '../services/skill/skillMdParser';
import type { SkillMdFrontmatter } from '../services/skill/skillMdParser';

// ===================== splitFrontmatterAndBody =====================

describe('splitFrontmatterAndBody', () => {
  it('should split standard YAML frontmatter and body', () => {
    const content = `---
name: my-skill
version: "1.0"
description: A test skill
---
# Skill Title

This is the body content.`;

    const result = splitFrontmatterAndBody(content);
    expect(result.frontmatterText).toContain('name: my-skill');
    expect(result.frontmatterText).toContain('version: "1.0"');
    expect(result.body).toContain('# Skill Title');
    expect(result.body).toContain('This is the body content.');
  });

  it('should handle content without frontmatter', () => {
    const content = '# Just a body\nNo frontmatter here.';
    const result = splitFrontmatterAndBody(content);
    expect(result.frontmatterText).toBe('');
    expect(result.body).toBe(content.trim());
  });

  it('should handle empty frontmatter', () => {
    const content = `---
---
Body only after empty frontmatter.`;

    const result = splitFrontmatterAndBody(content);
    expect(result.frontmatterText).toBe('');
    expect(result.body).toContain('Body only');
  });

  it('should handle CRLF line endings', () => {
    const content = '---\r\nname: test\r\n---\r\nBody content';
    const result = splitFrontmatterAndBody(content);
    expect(result.frontmatterText).toContain('name: test');
    expect(result.body).toContain('Body content');
  });

  it('should handle leading whitespace before frontmatter', () => {
    const content = '   \n  \n---\nname: test\n---\nBody';
    const result = splitFrontmatterAndBody(content);
    expect(result.frontmatterText).toContain('name: test');
    expect(result.body).toContain('Body');
  });
});

// ===================== parseFrontmatter =====================

describe('parseFrontmatter', () => {
  it('should parse simple key-value pairs', () => {
    const text = 'name: my-skill\nversion: "1.0"\ndescription: A test';
    const result = parseFrontmatter(text);
    expect(result.hasError).toBe(false);
    expect(result.data.name).toBe('my-skill');
    expect(result.data.version).toBe('1.0');
    expect(result.data.description).toBe('A test');
  });

  it('should parse arrays (tags)', () => {
    const text = 'name: test\ntags:\n  - tag1\n  - tag2';
    const result = parseFrontmatter(text);
    expect(result.hasError).toBe(false);
    expect(result.data.tags).toEqual(['tag1', 'tag2']);
  });

  it('should parse nested objects (dependencies)', () => {
    const text = `name: test
dependencies:
  - skillId: other-skill
    type: required
  - skillId: optional-skill
    type: optional
    versionRange: ">=2.0"`;

    const result = parseFrontmatter(text);
    expect(result.hasError).toBe(false);
    expect(result.data.dependencies).toHaveLength(2);
    expect(result.data.dependencies![0]).toEqual({
      skillId: 'other-skill',
      type: 'required',
    });
    expect(result.data.dependencies![1]).toEqual({
      skillId: 'optional-skill',
      type: 'optional',
      versionRange: '>=2.0',
    });
  });

  it('should parse permissions', () => {
    const text = `name: test
permissions:
  - name: file-read
    description: Read files from disk
    required: true
  - name: network
    required: false`;

    const result = parseFrontmatter(text);
    expect(result.hasError).toBe(false);
    expect(result.data.permissions).toHaveLength(2);
    expect(result.data.permissions![0]).toEqual({
      name: 'file-read',
      description: 'Read files from disk',
      required: true,
    });
  });

  it('should return error for invalid YAML', () => {
    const text = 'name: [invalid yaml: {unclosed';
    const result = parseFrontmatter(text);
    expect(result.hasError).toBe(true);
    expect(result.errorMessage).toContain('YAML parse error');
  });

  it('should return error for non-mapping YAML', () => {
    const text = '- item1\n- item2';
    const result = parseFrontmatter(text);
    expect(result.hasError).toBe(true);
    expect(result.errorMessage).toContain('mapping');
  });

  it('should return empty data for empty text', () => {
    const result = parseFrontmatter('');
    expect(result.hasError).toBe(false);
    expect(result.data).toEqual({});
  });

  it('should parse quoted strings with special characters', () => {
    const text = 'description: "This has: colons and \\"quotes\\""';
    const result = parseFrontmatter(text);
    expect(result.hasError).toBe(false);
    expect(result.data.description).toBe('This has: colons and "quotes"');
  });
});

// ===================== extractInstructionBlocks =====================

describe('extractInstructionBlocks', () => {
  it('should extract markdown instruction blocks', () => {
    const body = `# Title

Some intro text.

\`\`\`markdown
You are a helpful assistant.
Please help the user with their questions.
\`\`\`

More text.`;

    const blocks = extractInstructionBlocks(body);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('markdown');
    expect(blocks[0].content).toContain('You are a helpful assistant');
  });

  it('should extract prompt instruction blocks', () => {
    const body = `\`\`\`prompt
Analyze the data and provide insights.
\`\`\``;

    const blocks = extractInstructionBlocks(body);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('prompt');
    expect(blocks[0].content).toBe('Analyze the data and provide insights.');
  });

  it('should extract instruction instruction blocks', () => {
    const body = `\`\`\`instruction
Step 1: Open the file
Step 2: Process data
\`\`\``;

    const blocks = extractInstructionBlocks(body);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('instruction');
  });

  it('should extract multiple blocks of different types', () => {
    const body = `\`\`\`markdown
First block
\`\`\`

Some text between blocks.

\`\`\`prompt
Second block
\`\`\`

\`\`\`instruction
Third block
\`\`\``;

    const blocks = extractInstructionBlocks(body);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe('markdown');
    expect(blocks[1].type).toBe('prompt');
    expect(blocks[2].type).toBe('instruction');
  });

  it('should ignore other code block types', () => {
    const body = `\`\`\`javascript
console.log('hello');
\`\`\`

\`\`\`python
print('world')
\`\`\``;

    const blocks = extractInstructionBlocks(body);
    expect(blocks).toHaveLength(0);
  });

  it('should handle body without any code blocks', () => {
    const body = '# Just text\nNo code blocks here.';
    const blocks = extractInstructionBlocks(body);
    expect(blocks).toHaveLength(0);
  });

  it('should compute correct line numbers', () => {
    const body = `Line 0
Line 1
\`\`\`markdown
Block content line 3
Block content line 4
\`\`\`
Line 6`;

    const blocks = extractInstructionBlocks(body);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startLine).toBe(2);
    expect(blocks[0].endLine).toBe(5);
  });
});

// ===================== inferDescription =====================

describe('inferDescription', () => {
  it('should infer description from first paragraph', () => {
    const body = '# My Skill\n\nThis is a detailed description of the skill.\nIt does useful things.';
    const result = inferDescription(body);
    expect(result).toContain('This is a detailed description');
  });

  it('should return undefined for empty body', () => {
    expect(inferDescription('')).toBeUndefined();
  });

  it('should skip headings and code block indicators', () => {
    const body = `# Title
## Subtitle

\`\`\`python
print('hello')
\`\`\`

Actual paragraph text here.`;
    const result = inferDescription(body);
    expect(result).toContain('Actual paragraph text');
  });

  it('should truncate long descriptions to 200 chars', () => {
    const longDesc = 'A'.repeat(300);
    const body = `# Title\n\n${longDesc}`;
    const result = inferDescription(body);
    expect(result!.length).toBeLessThanOrEqual(203); // 200 + '...'
    expect(result).toContain('...');
  });
});

// ===================== inferTrigger =====================

describe('inferTrigger', () => {
  it('should infer trigger from "触发词" pattern', () => {
    const body = '触发词：搜索、查询、分析\nMore content.';
    const result = inferTrigger(body);
    expect(result).toEqual(['搜索', '查询', '分析']);
  });

  it('should infer trigger from "trigger:" pattern', () => {
    const body = 'trigger: search, query, analyze\nMore content.';
    const result = inferTrigger(body);
    expect(result).toContain('search');
    expect(result).toContain('query');
    expect(result).toContain('analyze');
  });

  it('should infer trigger from "触发：" pattern', () => {
    const body = '触发：文档管理\n更多内容。';
    const result = inferTrigger(body);
    expect(result).toEqual(['文档管理']);
  });

  it('should extract Chinese keywords from name when no trigger pattern found', () => {
    const body = 'Some text without trigger patterns.';
    const result = inferTrigger(body, '数据分析助手');
    expect(result).toEqual(['数据分析', '助手']);  // 2+ char Chinese chunks
  });

  it('should return undefined when nothing to infer', () => {
    const body = 'Just plain text without any trigger hints.';
    const result = inferTrigger(body, 'test-skill');
    expect(result).toBeUndefined();
  });
});

// ===================== parseSkillMd (完整流程) =====================

describe('parseSkillMd', () => {
  // --- 测试正常 YAML frontmatter ---
  it('should parse a complete SKILL.md with frontmatter and instructions', () => {
    const content = `---
name: data-analyzer
version: "2.0"
author: CDF Know Clow Team
description: Analyze warehouse data
trigger: 数据分析 / 趋势预测
category: data
icon: Analytics
tags:
  - 分析
  - 智能
dependencies:
  - skillId: data-sync
    type: required
permissions:
  - name: data-read
    description: Read warehouse data
    required: true
---

# Data Analyzer Skill

This skill analyzes warehouse data.

\`\`\`prompt
You are a CDF Know Clow data analysis assistant.
Help users analyze trends and detect anomalies.
\`\`\`

Additional instructions here.`;

    const result = parseSkillMd(content, '/path/to/SKILL.md');

    // Frontmatter fields
    expect(result.name).toBe('data-analyzer');
    expect(result.version).toBe('2.0');
    expect(result.author).toBe('CrossWMS Team');
    expect(result.description).toBe('Analyze warehouse data');
    expect(result.trigger).toEqual(['数据分析', '趋势预测']); // 按 / 拆分
    expect(result.category).toBe('data');
    expect(result.icon).toBe('Analytics');
    expect(result.tags).toEqual(['分析', '智能']);
    expect(result.dependencies).toEqual(['data-sync']);
    expect(result.permissions).toEqual(['data-read']);

    // Instruction blocks
    expect(result.instructionBlocks).toHaveLength(1);
    expect(result.instructionBlocks![0]).toContain('data analysis assistant');
    expect(result.instructionBlocks![0]).toContain('analyze trends');

    // Content (不含 frontmatter)
    expect(result.content).toContain('# Data Analyzer Skill');
    expect(result.content).toContain('Additional instructions');

    // 已提供 description，不应有 inferredDescription
    expect(result.inferredDescription).toBeUndefined();
    // 已提供 trigger，不应有 inferredTrigger
    expect(result.inferredTrigger).toBeUndefined();
  });

  // --- 测试缺失 frontmatter（纯 Markdown） ---
  it('should parse SKILL.md without frontmatter', () => {
    const content = `# Simple Skill

\`\`\`markdown
You are a simple assistant.
\`\`\``;

    const result = parseSkillMd(content);

    expect(result.name).toBeUndefined();
    expect(result.instructionBlocks).toHaveLength(1);
    expect(result.instructionBlocks![0]).toContain('simple assistant');
    expect(result.content).toContain('# Simple Skill');
  });

  // --- 测试指令块提取 ---
  it('should extract multiple instruction blocks', () => {
    const content = `---
name: multi-block
---

\`\`\`markdown
First block content
\`\`\`

\`\`\`prompt
Second block content
\`\`\`

\`\`\`instruction
Third block content
\`\`\``;

    const result = parseSkillMd(content);
    expect(result.instructionBlocks).toHaveLength(3);
    expect(result.instructionBlocks![0]).toBe('First block content');
    expect(result.instructionBlocks![1]).toBe('Second block content');
    expect(result.instructionBlocks![2]).toBe('Third block content');
  });

  it('should return undefined instructionBlocks when none found', () => {
    const content = `---
name: no-blocks
---

Just regular markdown text without code blocks.`;

    const result = parseSkillMd(content);
    expect(result.instructionBlocks).toBeUndefined();
  });

  // --- 测试自动推断 ---
  it('should infer description from body when not in frontmatter', () => {
    const content = `---
name: auto-skill
---

This skill does automatic things. It helps with automation.`;

    const result = parseSkillMd(content);
    expect(result.description).toBeUndefined();
    expect(result.inferredDescription).toContain('automatic things');
  });

  it('should infer trigger from body when not in frontmatter', () => {
    const content = `---
name: trigger-skill
---

触发词：文档、同步、导出数据`;

    const result = parseSkillMd(content);
    expect(result.trigger).toBeUndefined();
    expect(result.inferredTrigger).toEqual(['文档', '同步', '导出数据']);
  });

  it('should infer trigger from name keywords', () => {
    const content = `---
name: 数据分析引擎
---

Some body content.`;

    const result = parseSkillMd(content);
    expect(result.trigger).toBeUndefined();
    expect(result.inferredTrigger).toEqual(['数据分析', '引擎']);
  });

  it('should not override existing description with inferred', () => {
    const content = `---
name: test
description: Original description
---

Different text in body.`;

    const result = parseSkillMd(content);
    expect(result.description).toBe('Original description');
    expect(result.inferredDescription).toBeUndefined();
  });

  it('should not override existing trigger with inferred', () => {
    const content = `---
name: test
trigger: custom trigger / keyword
---

触发词：different trigger`;

    const result = parseSkillMd(content);
    expect(result.trigger).toEqual(['custom trigger', 'keyword']);
    expect(result.inferredTrigger).toBeUndefined();
  });

  // --- 测试错误处理 ---
  it('should handle invalid YAML gracefully (record warning, continue parsing body)', () => {
    const content = `---
name: [broken: {yaml
---
Body content.

\`\`\`prompt
Valid prompt here
\`\`\``;

    const result = parseSkillMd(content);
    // 应继续解析正文和指令块
    expect(result.content).toContain('Body content');
    expect(result.instructionBlocks).toHaveLength(1);
    expect(result.instructionBlocks![0]).toBe('Valid prompt here');
    // YAML 解析失败，但不应抛出异常
    expect(result.name).toBeUndefined();
    expect(result.inferredDescription).toBe('Body content.');
  });

  // --- 测试 trigger 类型转换 ---
  it('should convert single string trigger to array', () => {
    const content = `---
name: test
trigger: single-trigger
---

Body.`;

    const result = parseSkillMd(content);
    expect(result.trigger).toEqual(['single-trigger']);
  });

  it('should handle comma-separated trigger', () => {
    const content = `---
name: test
trigger: aaa, bbb, ccc
---

Body.`;

    const result = parseSkillMd(content);
    expect(result.trigger).toEqual(['aaa', 'bbb', 'ccc']);
  });

  // --- 测试 permissions / dependencies 过滤 ---
  it('should filter invalid dependencies and permissions', () => {
    const content = `---
name: filter-test
dependencies:
  - skillId: valid-dep
    type: required
  - invalid: no-skillId
  - skillId: ""
permissions:
  - name: valid-perm
  - description: missing name
  - name: ""
---

Body.`;

    const result = parseSkillMd(content);
    expect(result.dependencies).toEqual(['valid-dep']);
    expect(result.permissions).toEqual(['valid-perm']);
  });

  it('should handle filePath for name extraction', () => {
    const content = `---
name: my-skill
---

Body.`;

    const result = parseSkillMd(content, '/home/user/skills/my-skill/SKILL.md');
    expect(result.name).toBe('my-skill');
  });
});

// ===================== mapParsedToSkillFields =====================

describe('mapParsedToSkillFields', () => {
  it('should map parsed result to Skill fields', () => {
    const content = `---
name: mapped-skill
version: "3.0"
author: Test Author
description: A mapped skill
trigger: test trigger / another
category: tool
icon: Build
tags:
  - test
  - mapping
dependencies:
  - skillId: base-skill
    type: required
permissions:
  - name: file-access
    required: true
---

\`\`\`prompt
Test prompt template
\`\`\``;

    const parsed = parseSkillMd(content);
    const fields = mapParsedToSkillFields(parsed, 'mapped-skill-dir');

    expect(fields.id).toBe('user-mapped-skill-dir');
    expect(fields.name).toBe('mapped-skill');
    expect(fields.desc).toBe('A mapped skill');
    expect(fields.trigger).toBe('test trigger / another');
    expect(fields.version).toBe('3.0');
    expect(fields.author).toBe('Test Author');
    expect(fields.category).toBe('tool');
    expect(fields.icon).toBe('Build');
    expect(fields.tags).toEqual(['test', 'mapping']);
    expect(fields.promptTemplate).toBe('Test prompt template');
  });

  it('should use defaults for missing fields', () => {
    const content = `---
name: minimal-skill
---

Just a body.`;

    const parsed = parseSkillMd(content);
    const fields = mapParsedToSkillFields(parsed, 'minimal-dir');

    expect(fields.id).toBe('user-minimal-dir');
    expect(fields.name).toBe('minimal-skill');
    expect(fields.version).toBe('1.0');
    expect(fields.category).toBe('tool');
    expect(fields.icon).toBe('Extension');
    expect(fields.tags).toEqual([]);
    expect(fields.dependencies).toEqual([]);
    expect(fields.permissions).toEqual([]);
  });

  it('should use dirName as fallback for name', () => {
    const content = `---
description: No name field
---

Body content.`;

    const parsed = parseSkillMd(content);
    const fields = mapParsedToSkillFields(parsed, 'fallback-dir');

    expect(fields.name).toBe('fallback-dir');
  });

  it('should use inferredDescription when description is missing', () => {
    const content = `---
name: infer-desc
---

This is the inferred description from body.`;

    const parsed = parseSkillMd(content);
    const fields = mapParsedToSkillFields(parsed, 'infer-dir');

    expect(fields.desc).toBe('This is the inferred description from body.');
  });

  it('should use inferredTrigger when trigger is missing', () => {
    const content = `---
name: infer-trigger
---

触发词：文档管理、同步`;

    const parsed = parseSkillMd(content);
    const fields = mapParsedToSkillFields(parsed, 'infer-dir');

    expect(fields.trigger).toBe('文档管理 / 同步');
  });
});
