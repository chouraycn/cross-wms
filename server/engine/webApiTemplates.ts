/**
 * Web API Templates Engine — API 模板解析与执行引擎
 *
 * v3.0: 完整的模板调用管线：
 *   1. 从 api_templates 表加载模板
 *   2. Mustache-light 替换 {{param}} → 实际值
 *   3. 域名白名单校验 (api_domain_whitelist)
 *   4. Auth 注入（从 api_credentials，v3.0 暂用 header 合并）
 *   5. 发送 HTTP 请求
 *   6. 响应提取 (jsonpath / css selector / regex)
 *   7. 返回 JSON
 *
 * 依赖: jsonpath-plus (JSONPath), cheerio (CSS Selector)
 */

import { getApiTemplate } from '../dao/apiTemplates.js';
import { isDomainAllowed } from '../dao/apiDomainWhitelist.js';
import { getCredentialValue } from '../dao/apiCredentials.js';
import { JSONPath } from 'jsonpath-plus';
import * as cheerio from 'cheerio';

// ===================== Mustache-light Template Rendering =====================

/**
 * 轻量 Mustache 模板渲染。
 * 仅支持 {{var}} 占位符替换（不支持 {{#section}} 等高级语法）。
 *
 * 规则：
 * - {{var}} → params[var]（找不到则保留原样）
 * - {{var}} 中的 var 会 trim 空白
 * - 支持 {{var:default}} 语法 — 找不到 var 时使用 default
 */
export function renderTemplate(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr: string) => {
    // 支持 {{var:default}} 语法
    const colonIdx = expr.indexOf(':');
    if (colonIdx > 0) {
      const varName = expr.substring(0, colonIdx).trim();
      const defaultVal = expr.substring(colonIdx + 1).trim();
      return varName in params ? params[varName] : defaultVal;
    }
    return expr.trim() in params ? params[expr.trim()] : `{{${expr.trim()}}}`;
  });
}

// ===================== Response Extraction =====================

export type ResponseExtractor = 'none' | 'jsonpath' | 'css' | 'regex';

export interface ExtractionResult {
  extracted: unknown;
  extractorType: ResponseExtractor;
  matchCount: number;
}

/**
 * 从 HTTP 响应中提取数据。
 *
 * - jsonpath: 使用 JSONPath 查询 JSON 响应
 * - css: 使用 cheerio 查询 HTML 响应
 * - regex: 使用正则表达式匹配文本
 * - none: 返回原始响应
 */
export function extractResponse(
  responseBody: string,
  extractorType: ResponseExtractor,
  extractorPath: string,
): ExtractionResult {
  if (!extractorPath || extractorType === 'none') {
    try {
      return { extracted: JSON.parse(responseBody), extractorType: 'none', matchCount: 1 };
    } catch {
      return { extracted: responseBody, extractorType: 'none', matchCount: 1 };
    }
  }

  try {
    switch (extractorType) {
      case 'jsonpath': {
        const parsed = JSON.parse(responseBody);
        const results = JSONPath({ path: extractorPath, json: parsed });
        return {
          extracted: results,
          extractorType: 'jsonpath',
          matchCount: Array.isArray(results) ? results.length : 1,
        };
      }

      case 'css': {
        const $ = cheerio.load(responseBody);
        const elements = $(extractorPath);
        const results: string[] = [];
        elements.each((_, el) => {
          results.push($(el).text().trim());
        });
        return {
          extracted: results,
          extractorType: 'css',
          matchCount: results.length,
        };
      }

      case 'regex': {
        const regex = new RegExp(extractorPath, 'gm');
        const matches = [...responseBody.matchAll(regex)];
        const results = matches.map(m => m[1] ?? m[0]);
        return {
          extracted: results,
          extractorType: 'regex',
          matchCount: results.length,
        };
      }

      default:
        return { extracted: responseBody, extractorType: 'none', matchCount: 1 };
    }
  } catch (e) {
    return {
      extracted: { error: `响应提取失败: ${e instanceof Error ? e.message : String(e)}`, rawPreview: responseBody.substring(0, 500) },
      extractorType,
      matchCount: 0,
    };
  }
}

// ===================== Execute Template =====================

export interface ExecuteTemplateParams {
  templateId: string;
  variables: Record<string, string>;
  /** 覆盖模板的 headers（用于 Auth 注入等） */
  extraHeaders?: Record<string, string>;
  /** 覆盖模板的 body（直接传入 body） */
  extraBody?: string;
  /** 超时毫秒（默认 15s） */
  timeoutMs?: number;
}

export interface ExecuteTemplateResult {
  success: boolean;
  templateId: string;
  url: string;
  method: string;
  statusCode: number | null;
  statusText: string | null;
  contentType: string | null;
  durationMs: number;
  extracted: unknown;
  extractorType: ResponseExtractor;
  matchCount: number;
  error?: string;
}

/**
 * 执行 API 模板 — 完整调用管线
 *
 * 流程: 加载模板 → 替换变量 → 域名校验 → 合并 headers → 发送请求 → 提取响应
 */
export async function executeApiTemplate(params: ExecuteTemplateParams): Promise<ExecuteTemplateResult> {
  const startTime = Date.now();

  // 1. 加载模板
  const template = getApiTemplate(params.templateId);
  if (!template) {
    return {
      success: false,
      templateId: params.templateId,
      url: '',
      method: '',
      statusCode: null,
      statusText: null,
      contentType: null,
      durationMs: Date.now() - startTime,
      extracted: null,
      extractorType: 'none',
      matchCount: 0,
      error: `模板不存在: ${params.templateId}`,
    };
  }

  // 2. 替换 URL 模板中的变量
  const renderedPath = renderTemplate(template.path_template, params.variables);
  const url = `https://${template.domain}${renderedPath}`;

  // 3. 域名白名单校验
  if (!isDomainAllowed(template.domain)) {
    return {
      success: false,
      templateId: params.templateId,
      url,
      method: template.method,
      statusCode: null,
      statusText: null,
      contentType: null,
      durationMs: Date.now() - startTime,
      extracted: null,
      extractorType: 'none',
      matchCount: 0,
      error: `域名不在白名单中: ${template.domain}`,
    };
  }

  // 4. 合并 headers
  let headers: Record<string, string> = {};
  try {
    headers = template.headers_json ? JSON.parse(template.headers_json) : {};
  } catch {
    headers = {};
  }
  // 渲染 headers 中的模板变量
  for (const [key, val] of Object.entries(headers)) {
    if (typeof val === 'string') {
      headers[key] = renderTemplate(val, params.variables);
    }
  }

  // v3.0: 凭证注入 — 检查 headers 中的 {{credential:ID}} 占位符
  const baseErrorResult: Omit<ExecuteTemplateResult, 'error'> = {
    success: false,
    templateId: params.templateId,
    url,
    method: template.method,
    statusCode: null,
    statusText: null,
    contentType: null,
    durationMs: Date.now() - startTime,
    extracted: null,
    extractorType: 'none',
    matchCount: 0,
  };

  for (const [key, val] of Object.entries(headers)) {
    if (typeof val === 'string') {
      const credMatch = val.match(/^\{\{credential:([^}]+)\}\}$/);
      if (credMatch) {
        const credValue = getCredentialValue(credMatch[1]);
        if (credValue) {
          headers[key] = credValue;
        } else {
          return { ...baseErrorResult, error: `凭证不存在或已失效: ${credMatch[1]}` };
        }
      }
    }
  }

  // 合并额外 headers（如 Auth 凭证）
  if (params.extraHeaders) {
    headers = { ...headers, ...params.extraHeaders };
  }

  // 5. 构建 body
  let body: string | undefined;
  if (params.extraBody) {
    body = params.extraBody;
  } else if (template.body_template) {
    body = renderTemplate(template.body_template, params.variables);
  }

  // 6. 发送 HTTP 请求
  const method = template.method;
  const timeoutMs = params.timeoutMs ?? 15000;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const requestInit: RequestInit = {
      method,
      headers: {
        ...headers,
        'User-Agent': 'CrossWMS-AI/1.0',
      },
      signal: controller.signal,
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      requestInit.body = body;
      // 如果没设 Content-Type 且 body 看起来像 JSON，自动添加
      if (!headers['Content-Type'] && !headers['content-type']) {
        try {
          JSON.parse(body);
          (requestInit.headers as Record<string, string>)['Content-Type'] = 'application/json';
        } catch {
          // 不是 JSON，不自动添加
        }
      }
    }

    const response = await fetch(url, requestInit);
    clearTimeout(timeoutId);

    const resContentType = response.headers.get('content-type') || '';
    const resText = await response.text();

    // 7. 响应提取
    const extractorType = (template.response_extractor || 'none') as ResponseExtractor;
    const extractorPath = template.response_path || '';
    const extractionResult = extractResponse(resText, extractorType, extractorPath);

    const durationMs = Date.now() - startTime;

    const result: ExecuteTemplateResult = {
      success: response.ok,
      templateId: params.templateId,
      url,
      method,
      statusCode: response.status,
      statusText: response.statusText,
      contentType: resContentType,
      durationMs,
      extracted: extractionResult.extracted,
      extractorType: extractionResult.extractorType,
      matchCount: extractionResult.matchCount,
    };

    // v3.0: 自动写入请求历史
    try {
      const { insertHistory } = await import('../dao/apiRequestHistory.js');
      // 收集请求/响应详细信息
      const requestHeadersJson = JSON.stringify(headers);
      const requestBodyStr = body || null;
      const responseHeadersJson = JSON.stringify(Object.fromEntries(response.headers.entries()));
      const responseBodyStr = resText;

      insertHistory({
        templateId: params.templateId,
        url,
        method,
        statusCode: result.statusCode,
        durationMs: result.durationMs,
        isSuccess: result.success,
        extractedPreview: JSON.stringify(result.extracted).substring(0, 500),
        error: result.error,
        requestHeaders: requestHeadersJson,
        requestBody: requestBodyStr ?? undefined,
        responseHeaders: responseHeadersJson,
        responseBody: responseBodyStr,
      });
    } catch {
      /* 不影响主流程 */
    }

    return result;
  } catch (e) {
    const durationMs = Date.now() - startTime;
    const errorMessage = e instanceof DOMException && e.name === 'AbortError'
      ? `请求超时（${timeoutMs / 1000}秒）`
      : `请求失败: ${e instanceof Error ? e.message : String(e)}`;

    const result: ExecuteTemplateResult = {
      success: false,
      templateId: params.templateId,
      url,
      method,
      statusCode: null,
      statusText: null,
      contentType: null,
      durationMs,
      extracted: null,
      extractorType: 'none',
      matchCount: 0,
      error: errorMessage,
    };

    // v3.0: 自动写入请求历史（失败也记录）
    try {
      const { insertHistory } = await import('../dao/apiRequestHistory.js');
      // 失败时仅记录请求信息（无响应）
      const requestHeadersJson = JSON.stringify(headers);
      const requestBodyStr = body || null;

      insertHistory({
        templateId: params.templateId,
        url,
        method,
        statusCode: null,
        durationMs: result.durationMs,
        isSuccess: false,
        error: errorMessage,
        requestHeaders: requestHeadersJson,
        requestBody: requestBodyStr ?? undefined,
      });
    } catch {
      /* 不影响主流程 */
    }

    return result;
  }
}

// ===================== Test Template =====================

/**
 * 测试 API 模板 — 不存储历史，仅返回执行结果
 * 用于用户在管理页面验证模板配置是否正确
 */
export async function testApiTemplate(
  templateId: string,
  variables: Record<string, string> = {},
  extraHeaders?: Record<string, string>,
): Promise<ExecuteTemplateResult> {
  return executeApiTemplate({ templateId, variables, extraHeaders });
}
