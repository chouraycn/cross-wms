/**
 * Handlebars 模板渲染器 (v1.5.79)
 *
 * 将 SKILL.md body 中的 Handlebars 模板变量替换为实际值。
 * 支持 {{userInput}}, {{#each references}}, {{chain.X}} helper。
 *
 * 注意：Handlebars 依赖暂未安装（npm install handlebars），
 * 当前使用简单的字符串替换 fallback 实现，后续切换到完整 Handlebars。
 */

// ===================== 类型定义 =====================

export interface PromptContext {
  userInput: string;
  displayName?: string;
  context: Record<string, unknown>;
  references: Array<{ filename: string; summary: string; content?: string }>;
  chain: Record<string, unknown>;
  _chainOutputs?: Record<string, string>;
}

// ===================== 简单模板引擎（Handlebars 安装前的 fallback） =====================

/**
 * 使用简单字符串替换渲染模板。
 * 支持的语法：
 *   {{userInput}}  → context.userInput
 *   {{displayName}} → context.displayName
 *   {{context.xxx}} → context.context.xxx
 *   {{chain.X}}     → context.chain.X
 */
function simpleRender(template: string, context: Record<string, unknown>): string {
  let result = template;

  // 替换 {{userInput}}
  result = result.replace(/\{\{userInput\}\}/g, String(context.userInput ?? ''));

  // 替换 {{displayName}}
  result = result.replace(/\{\{displayName\}\}/g, String(context.displayName ?? ''));

  // 替换 {{context.xxx}}
  result = result.replace(/\{\{context\.(\w+)\}\}/g, (_match, key: string) => {
    const ctx = context.context as Record<string, unknown> | undefined;
    return ctx ? String(ctx[key] ?? '') : '';
  });

  // 替换 {{chain.X}}
  result = result.replace(/\{\{chain\.(\w+)\}\}/g, (_match, key: string) => {
    const chain = context.chain as Record<string, unknown> | undefined;
    const outputs = context._chainOutputs as Record<string, string> | undefined;
    if (outputs && outputs[key] !== undefined) {
      return outputs[key];
    }
    return chain ? String(chain[key] ?? '') : '';
  });

  // 处理 {{#each references}}...{{/each}} 块
  result = result.replace(/\{\{#each references\}\}([\s\S]*?)\{\{\/each\}\}/g, (_match, inner: string) => {
    const refs = context.references as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(refs) || refs.length === 0) return '';
    return refs.map((ref) => {
      let block = inner;
      block = block.replace(/\{\{filename\}\}/g, String(ref.filename ?? ''));
      block = block.replace(/\{\{summary\}\}/g, String(ref.summary ?? ''));
      block = block.replace(/\{\{content\}\}/g, String(ref.content ?? ''));
      return block;
    }).join('');
  });

  // 处理 {{#if xxx}}...{{/if}} 块
  result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match, cond: string, inner: string) => {
    const val = context[cond];
    if (val && val !== 'false' && val !== false) return inner;
    // Also check context.context
    const ctxVal = (context.context as Record<string, unknown>)?.[cond];
    if (ctxVal && ctxVal !== 'false' && ctxVal !== false) return inner;
    return '';
  });

  return result;
}

// ===================== 公开 API =====================

/**
 * 渲染技能 prompt 模板。
 * 未来切换到完整 Handlebars 时，只需修改此函数内部实现。
 *
 * @param template - SKILL.md body 中的 prompt 模板
 * @param context - 模板变量上下文
 * @returns 渲染后的 prompt 字符串
 */
export function renderPrompt(template: string, context: PromptContext): string {
  // TODO: 安装 handlebars 后替换为：
  // import Handlebars from 'handlebars';
  // const compiled = Handlebars.compile(template, { noEscape: true });
  // return compiled(context);

  return simpleRender(template, context as unknown as Record<string, unknown>);
}

// ===================== Handlebars helper 注册（预留） =====================

/**
 * 注册自定义 Handlebars helpers（安装 handlebars 后启用）。
 *
 * 用法：
 *   registerHelpers();
 *   const compiled = Handlebars.compile(template);
 *   return compiled(context);
 */
export function registerHelpers(): void {
  // TODO: 安装 handlebars 后启用
  // Handlebars.registerHelper('chain', function (this: unknown, nodeName: string) {
  //   const ctx = this as PromptContext;
  //   return ctx._chainOutputs?.[nodeName] || '';
  // });
}
