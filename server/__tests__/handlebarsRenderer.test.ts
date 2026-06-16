/**
 * handlebarsRenderer 模板渲染测试
 *
 * 覆盖点：
 *   - {{userInput}} 简单替换
 *   - {{displayName}} 替换
 *   - {{context.xxx}} 嵌套属性替换
 *   - {{chain.X}} 链式变量替换（优先 _chainOutputs）
 *   - {{#each references}}...{{/each}} 块循环
 *   - {{#if xxx}}...{{/if}} 条件块
 *   - 缺失变量回退为空字符串
 *   - registerHelpers 无报错
 */
import { describe, it, expect } from 'vitest';
import { renderPrompt, registerHelpers, type PromptContext } from '../services/handlebarsRenderer.js';

describe('handlebarsRenderer', () => {
  // -------------------- {{userInput}} --------------------
  describe('{{userInput}} 替换', () => {
    it('应替换 userInput 变量', () => {
      const template = '用户说：{{userInput}}';
      const ctx: PromptContext = {
        userInput: '查询库存',
        context: {},
        references: [],
        chain: {},
      };
      expect(renderPrompt(template, ctx)).toBe('用户说：查询库存');
    });

    it('多次出现应全部替换', () => {
      const template = '{{userInput}} - 重复: {{userInput}}';
      const ctx: PromptContext = {
        userInput: 'hello',
        context: {},
        references: [],
        chain: {},
      };
      expect(renderPrompt(template, ctx)).toBe('hello - 重复: hello');
    });

    it('userInput 为空时应替换为空字符串', () => {
      const template = '输入: {{userInput}}';
      const ctx: PromptContext = {
        userInput: '',
        context: {},
        references: [],
        chain: {},
      };
      expect(renderPrompt(template, ctx)).toBe('输入: ');
    });
  });

  // -------------------- {{displayName}} --------------------
  describe('{{displayName}} 替换', () => {
    it('应替换 displayName 变量', () => {
      const template = '技能: {{displayName}}';
      const ctx: PromptContext = {
        userInput: '',
        displayName: '库存查询',
        context: {},
        references: [],
        chain: {},
      };
      expect(renderPrompt(template, ctx)).toBe('技能: 库存查询');
    });

    it('displayName 未设置时应替换为空字符串', () => {
      const template = '技能: {{displayName}}';
      const ctx: PromptContext = {
        userInput: '',
        context: {},
        references: [],
        chain: {},
      };
      expect(renderPrompt(template, ctx)).toBe('技能: ');
    });
  });

  // -------------------- {{context.xxx}} --------------------
  describe('{{context.xxx}} 嵌套属性替换', () => {
    it('应替换 context 中的嵌套属性', () => {
      const template = '仓库: {{context.warehouse}}';
      const ctx: PromptContext = {
        userInput: '',
        context: { warehouse: '上海仓' },
        references: [],
        chain: {},
      };
      expect(renderPrompt(template, ctx)).toBe('仓库: 上海仓');
    });

    it('context 中不存在的属性应替换为空字符串', () => {
      const template = '仓库: {{context.warehouse}}';
      const ctx: PromptContext = {
        userInput: '',
        context: {},
        references: [],
        chain: {},
      };
      expect(renderPrompt(template, ctx)).toBe('仓库: ');
    });
  });

  // -------------------- {{chain.X}} --------------------
  describe('{{chain.X}} 链式变量替换', () => {
    it('应优先使用 _chainOutputs 中的值', () => {
      const template = '上游结果: {{chain.step1}}';
      const ctx: PromptContext = {
        userInput: '',
        context: {},
        references: [],
        chain: { step1: 'chain-value' },
        _chainOutputs: { step1: 'output-value' },
      };
      expect(renderPrompt(template, ctx)).toBe('上游结果: output-value');
    });

    it('_chainOutputs 不存在时应使用 chain 中的值', () => {
      const template = '上游结果: {{chain.step1}}';
      const ctx: PromptContext = {
        userInput: '',
        context: {},
        references: [],
        chain: { step1: 'chain-value' },
      };
      expect(renderPrompt(template, ctx)).toBe('上游结果: chain-value');
    });

    it('chain 和 _chainOutputs 都无值时应替换为空字符串', () => {
      const template = '上游结果: {{chain.step1}}';
      const ctx: PromptContext = {
        userInput: '',
        context: {},
        references: [],
        chain: {},
      };
      expect(renderPrompt(template, ctx)).toBe('上游结果: ');
    });
  });

  // -------------------- {{#each references}} --------------------
  describe('{{#each references}} 循环', () => {
    it('应遍历 references 数组', () => {
      const template = '参考资料:\n{{#each references}}- {{filename}}: {{summary}}\n{{/each}}';
      const ctx: PromptContext = {
        userInput: '',
        context: {},
        references: [
          { filename: 'doc1.md', summary: '文档1', content: '内容1' },
          { filename: 'doc2.md', summary: '文档2', content: '内容2' },
        ],
        chain: {},
      };
      const result = renderPrompt(template, ctx);
      expect(result).toContain('doc1.md');
      expect(result).toContain('文档1');
      expect(result).toContain('doc2.md');
      expect(result).toContain('文档2');
    });

    it('references 为空时应输出空字符串', () => {
      const template = '参考资料:\n{{#each references}}- {{filename}}\n{{/each}}';
      const ctx: PromptContext = {
        userInput: '',
        context: {},
        references: [],
        chain: {},
      };
      const result = renderPrompt(template, ctx);
      expect(result).toBe('参考资料:\n');
    });

    it('应替换循环内的 {{content}}', () => {
      const template = '{{#each references}}{{content}}{{/each}}';
      const ctx: PromptContext = {
        userInput: '',
        context: {},
        references: [
          { filename: 'doc.md', summary: '摘要', content: '实际内容' },
        ],
        chain: {},
      };
      expect(renderPrompt(template, ctx)).toBe('实际内容');
    });
  });

  // -------------------- {{#if xxx}} --------------------
  describe('{{#if xxx}} 条件块', () => {
    it('条件为真时应显示内容', () => {
      const template = '{{#if userInput}}有输入: {{userInput}}{{/if}}';
      const ctx: PromptContext = {
        userInput: 'hello',
        context: {},
        references: [],
        chain: {},
      };
      expect(renderPrompt(template, ctx)).toBe('有输入: hello');
    });

    it('条件为假时应隐藏内容', () => {
      const template = '{{#if userInput}}有输入{{/if}}';
      const ctx: PromptContext = {
        userInput: '',
        context: {},
        references: [],
        chain: {},
      };
      expect(renderPrompt(template, ctx)).toBe('');
    });

    it('条件为 false 字符串时应隐藏内容', () => {
      const template = '{{#if flag}}显示{{/if}}';
      const ctx: PromptContext = {
        userInput: '',
        context: { flag: 'false' },
        references: [],
        chain: {},
      };
      // Note: the #if checks context.context too
      expect(renderPrompt(template, ctx)).toBe('');
    });

    it('条件为 context 中的值时也应工作', () => {
      const template = '{{#if warehouse}}仓库已选{{/if}}';
      const ctx: PromptContext = {
        userInput: '',
        context: { warehouse: '上海仓' },
        references: [],
        chain: {},
      };
      expect(renderPrompt(template, ctx)).toBe('仓库已选');
    });
  });

  // -------------------- 复合模板 --------------------
  describe('复合模板', () => {
    it('应同时处理多种模板语法', () => {
      const template = [
        '用户: {{userInput}}',
        '技能: {{displayName}}',
        '仓库: {{context.warehouse}}',
        '{{#if context.warehouse}}仓库信息已加载{{/if}}',
        '{{#each references}}- {{filename}}: {{summary}}\n{{/each}}',
      ].join('\n');

      const ctx: PromptContext = {
        userInput: '查询库存',
        displayName: '库存查询',
        context: { warehouse: '上海仓' },
        references: [
          { filename: 'guide.md', summary: '操作指南', content: '详细步骤' },
        ],
        chain: {},
      };

      const result = renderPrompt(template, ctx);
      expect(result).toContain('用户: 查询库存');
      expect(result).toContain('技能: 库存查询');
      expect(result).toContain('仓库: 上海仓');
      expect(result).toContain('仓库信息已加载');
      expect(result).toContain('guide.md');
      expect(result).toContain('操作指南');
    });
  });

  // -------------------- registerHelpers --------------------
  describe('registerHelpers', () => {
    it('调用不应报错', () => {
      expect(() => registerHelpers()).not.toThrow();
    });
  });

  // -------------------- 无模板变量 --------------------
  describe('无模板变量', () => {
    it('纯文本模板应原样返回', () => {
      const template = '这是纯文本，没有模板变量';
      const ctx: PromptContext = {
        userInput: '',
        context: {},
        references: [],
        chain: {},
      };
      expect(renderPrompt(template, ctx)).toBe('这是纯文本，没有模板变量');
    });
  });
});
