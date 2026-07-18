/**
 * MCP 提示模板管理器
 *
 * 实现 MCP 提示协议，支持 mustache 风格的变量插值和条件块。
 * 支持模板版本管理、参数验证、模板分类等高级功能。
 */

import { logger } from '../../logger.js';
import type { MCPPrompt, MCPPromptGetResult, MCPContent } from './types.js';

export type PromptTemplate = {
  name: string;
  description?: string;
  template: string;
  version?: string;
  category?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
    default?: unknown;
  }>;
};

export type TemplateInfo = {
  name: string;
  description?: string;
  version?: string;
  category?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
};

type TemplateVersion = {
  version: string;
  template: PromptTemplate;
  createdAt: number;
};

export class PromptTemplateManager {
  private templates: Map<string, PromptTemplate> = new Map();
  private templateVersions: Map<string, TemplateVersion[]> = new Map();
  private categories: Map<string, Set<string>> = new Map();
  private renderCache: Map<string, { result: string; timestamp: number }> = new Map();
  private cacheEnabled: boolean = false;
  private cacheTtlMs: number = 60000;

  registerTemplate(template: PromptTemplate): void {
    if (this.templates.has(template.name)) {
      logger.warn(`[PromptTemplateManager] Overwriting existing template: ${template.name}`);
      const existing = this.templates.get(template.name)!;
      if (existing.version) {
        if (!this.templateVersions.has(template.name)) {
          this.templateVersions.set(template.name, []);
        }
        this.templateVersions.get(template.name)!.push({
          version: existing.version,
          template: existing,
          createdAt: Date.now(),
        });
      }
    }

    this.templates.set(template.name, template);

    if (template.category) {
      if (!this.categories.has(template.category)) {
        this.categories.set(template.category, new Set());
      }
      this.categories.get(template.category)!.add(template.name);
    }

    logger.debug(`[PromptTemplateManager] Registered template: ${template.name}`);
  }

  getTemplate(name: string, version?: string): PromptTemplate | undefined {
    if (version) {
      const versions = this.templateVersions.get(name);
      if (versions) {
        const found = versions.find((v) => v.version === version);
        if (found) {
          return found.template;
        }
      }
      return undefined;
    }
    return this.templates.get(name);
  }

  render(name: string, params: Record<string, unknown> = {}): string {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template not found: ${name}`);
    }

    const validatedParams = this.validateAndFillDefaults(template, params);

    const cacheKey = this.generateCacheKey(name, validatedParams);
    if (this.cacheEnabled) {
      const cached = this.getCachedRender(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    if (template.arguments) {
      for (const arg of template.arguments) {
        if (arg.required && validatedParams[arg.name] === undefined) {
          throw new Error(`Missing required argument: ${arg.name}`);
        }
      }
    }

    let result = template.template;

    result = this.processConditionals(result, validatedParams);
    result = this.processEach(result, validatedParams);
    result = this.processVariables(result, validatedParams);
    result = this.processTripleBraces(result, validatedParams);

    if (this.cacheEnabled) {
      this.setCachedRender(cacheKey, result);
    }

    return result;
  }

  private validateAndFillDefaults(template: PromptTemplate, params: Record<string, unknown>): Record<string, unknown> {
    const result = { ...params };

    if (template.arguments) {
      for (const arg of template.arguments) {
        if (result[arg.name] === undefined && arg.default !== undefined) {
          result[arg.name] = arg.default;
        }

        if (result[arg.name] !== undefined && arg.type) {
          if (!this.checkParamType(result[arg.name], arg.type)) {
            throw new Error(`Argument ${arg.name} has wrong type: expected ${arg.type}`);
          }
        }
      }
    }

    return result;
  }

  private checkParamType(value: unknown, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  listTemplates(options?: { category?: string }): TemplateInfo[] {
    let templates = Array.from(this.templates.values());

    if (options?.category) {
      const categoryTemplates = this.categories.get(options.category);
      if (categoryTemplates) {
        templates = templates.filter((t) => categoryTemplates.has(t.name));
      } else {
        return [];
      }
    }

    return templates.map((t) => ({
      name: t.name,
      description: t.description,
      version: t.version,
      category: t.category,
      arguments: t.arguments?.map((a) => ({
        name: a.name,
        description: a.description,
        required: a.required,
      })),
    }));
  }

  unregisterTemplate(name: string): void {
    const template = this.templates.get(name);
    if (template?.category) {
      const categorySet = this.categories.get(template.category);
      if (categorySet) {
        categorySet.delete(name);
        if (categorySet.size === 0) {
          this.categories.delete(template.category);
        }
      }
    }

    this.templates.delete(name);
    this.templateVersions.delete(name);
    logger.debug(`[PromptTemplateManager] Unregistered template: ${name}`);
  }

  hasTemplate(name: string): boolean {
    return this.templates.has(name);
  }

  clear(): void {
    this.templates.clear();
    this.templateVersions.clear();
    this.categories.clear();
    this.renderCache.clear();
    logger.debug('[PromptTemplateManager] Cleared all templates');
  }

  getTemplateCount(): number {
    return this.templates.size;
  }

  listCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  getCategoryCount(): number {
    return this.categories.size;
  }

  getTemplateVersions(name: string): string[] {
    const versions = this.templateVersions.get(name);
    return versions ? versions.map((v) => v.version) : [];
  }

  enableCache(ttlMs?: number): void {
    this.cacheEnabled = true;
    if (ttlMs) {
      this.cacheTtlMs = ttlMs;
    }
    logger.debug(`[PromptTemplateManager] Cache enabled with TTL: ${this.cacheTtlMs}ms`);
  }

  disableCache(): void {
    this.cacheEnabled = false;
    this.renderCache.clear();
    logger.debug('[PromptTemplateManager] Cache disabled');
  }

  clearCache(): void {
    this.renderCache.clear();
    logger.debug('[PromptTemplateManager] Cache cleared');
  }

  private processConditionals(template: string, params: Record<string, unknown>): string {
    const ifPattern = /\{\{#if\s+(\w+(?:\.\w+)*)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;

    return template.replace(ifPattern, (_match, varPath: string, ifContent: string, elseContent: string = '') => {
      const value = this.resolvePath(params, varPath);
      const condition = Boolean(value);
      return condition ? ifContent : elseContent;
    });
  }

  private processEach(template: string, params: Record<string, unknown>): string {
    const eachPattern = /\{\{#each\s+(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/each\}\}/g;

    return template.replace(eachPattern, (_match, varPath: string, content: string) => {
      const array = this.resolvePath(params, varPath);
      if (!Array.isArray(array)) {
        return '';
      }

      return array
        .map((item, index) => {
          let itemContent = content;

          if (typeof item === 'object' && item !== null) {
            itemContent = this.processVariables(itemContent, item as Record<string, unknown>);
          } else {
            itemContent = itemContent.replace(/\{\{this\}\}/g, String(item));
          }

          itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index));
          itemContent = itemContent.replace(/\{\{@first\}\}/g, String(index === 0));
          itemContent = itemContent.replace(/\{\{@last\}\}/g, String(index === array.length - 1));

          return itemContent;
        })
        .join('');
    });
  }

  private processVariables(template: string, params: Record<string, unknown>): string {
    const varPattern = /\{\{(\w+(?:\.\w+)*)\}\}/g;

    return template.replace(varPattern, (_match, varPath: string) => {
      if (varPath.startsWith('@') || varPath === 'this') {
        return _match;
      }

      const value = this.resolvePath(params, varPath);
      if (value === undefined || value === null) {
        return '';
      }
      return String(value);
    });
  }

  private processTripleBraces(template: string, params: Record<string, unknown>): string {
    const triplePattern = /\{\{\{(\w+(?:\.\w+)*)\}\}\}/g;

    return template.replace(triplePattern, (_match, varPath: string) => {
      const value = this.resolvePath(params, varPath);
      if (value === undefined || value === null) {
        return '';
      }
      return String(value);
    });
  }

  private resolvePath(params: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let value: unknown = params;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  private generateCacheKey(name: string, params: Record<string, unknown>): string {
    return `${name}:${JSON.stringify(params)}`;
  }

  private getCachedRender(key: string): string | undefined {
    const entry = this.renderCache.get(key);
    if (!entry) {
      return undefined;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.cacheTtlMs) {
      this.renderCache.delete(key);
      return undefined;
    }

    return entry.result;
  }

  private setCachedRender(key: string, result: string): void {
    this.renderCache.set(key, {
      result,
      timestamp: Date.now(),
    });

    const maxCacheSize = 500;
    if (this.renderCache.size > maxCacheSize) {
      const firstKey = this.renderCache.keys().next().value;
      if (firstKey !== undefined) {
        this.renderCache.delete(firstKey);
      }
    }
  }

  toMCPPrompts(): MCPPrompt[] {
    return Array.from(this.templates.values()).map((t) => ({
      name: t.name,
      description: t.description,
      arguments: t.arguments?.map((a) => ({
        name: a.name,
        description: a.description,
        required: a.required,
      })),
    }));
  }

  toMCPPromptGetResult(name: string, params?: Record<string, string>): MCPPromptGetResult {
    const rendered = this.render(name, params ?? {});
    return {
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: rendered }] as MCPContent[],
        },
      ],
    };
  }
}

export const promptTemplateManager = new PromptTemplateManager();

export function registerTemplate(template: PromptTemplate): void {
  promptTemplateManager.registerTemplate(template);
}

export function renderTemplate(name: string, params?: Record<string, unknown>): string {
  return promptTemplateManager.render(name, params);
}

export function listTemplates(): TemplateInfo[] {
  return promptTemplateManager.listTemplates();
}

export function getTemplate(name: string): PromptTemplate | undefined {
  return promptTemplateManager.getTemplate(name);
}
