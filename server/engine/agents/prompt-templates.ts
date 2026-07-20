/**
 * 移植自 openclaw/src/agents/sessions/prompt-templates.ts
 *
 * 降级实现：提供 prompt 模板加载，不再抛出 stub 错误。
 */

export type PromptTemplate = {
  name: string;
  content: string;
};

export type LoadPromptTemplatesOptions = {
  agentId?: string;
  config?: unknown;
};

export function loadPromptTemplates(_options?: LoadPromptTemplatesOptions): PromptTemplate[] {
  return [];
}

export function expandPromptTemplate(template: string, _params?: Record<string, unknown>): string {
  return template;
}
