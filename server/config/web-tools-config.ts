/**
 * Web Tools Config — Web 工具配置
 *
 * 定义 Web 搜索、Web 抓取和内容提取的配置接口、默认配置和验证逻辑。
 */

import type { WebContentExtractMode } from "../plugins/web-content-extractor-types.js";

// ==================== 搜索配置 ====================

export interface WebSearchProviderConfig {
  provider?: string;
  maxResults?: number;
  timeoutMs?: number;
  userAgent?: string;
  [key: string]: unknown;
}

// ==================== 抓取配置 ====================

export interface WebFetchProviderConfig {
  provider?: string;
  maxLength?: number;
  timeoutMs?: number;
  userAgent?: string;
  renderJs?: boolean;
  defaultWaitUntil?: "domcontentloaded" | "networkidle" | "load";
  [key: string]: unknown;
}

// ==================== 内容提取配置 ====================

export interface WebContentExtractorConfig {
  defaultMode: WebContentExtractMode;
  maxLength?: number;
  preferExtractors?: string[];
  selectors?: string[];
  excludeSelectors?: string[];
}

// ==================== 完整配置 ====================

export interface WebToolsConfig {
  search: WebSearchProviderConfig;
  fetch: WebFetchProviderConfig;
  extractor: WebContentExtractorConfig;
  enabled: boolean;
}

// ==================== 默认配置 ====================

export const DEFAULT_WEB_TOOLS_CONFIG: WebToolsConfig = {
  enabled: true,
  search: {
    maxResults: 8,
    timeoutMs: 10000,
    userAgent: "CrossWMS-AI/1.0",
  },
  fetch: {
    maxLength: 80000,
    timeoutMs: 15000,
    userAgent: "CrossWMS-AI/1.0",
    renderJs: false,
    defaultWaitUntil: "networkidle",
  },
  extractor: {
    defaultMode: "markdown",
    maxLength: 80000,
  },
};

// ==================== 配置验证 ====================

export interface WebToolsConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateWebToolsConfig(
  config: Partial<WebToolsConfig>,
): WebToolsConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.search !== undefined) {
    if (config.search.maxResults !== undefined) {
      if (typeof config.search.maxResults !== "number" || config.search.maxResults < 1) {
        errors.push("search.maxResults 必须是大于 0 的数字");
      } else if (config.search.maxResults > 50) {
        warnings.push("search.maxResults 超过 50 可能导致性能问题");
      }
    }

    if (config.search.timeoutMs !== undefined) {
      if (typeof config.search.timeoutMs !== "number" || config.search.timeoutMs < 1000) {
        errors.push("search.timeoutMs 必须大于等于 1000 毫秒");
      }
    }
  }

  if (config.fetch !== undefined) {
    if (config.fetch.maxLength !== undefined) {
      if (typeof config.fetch.maxLength !== "number" || config.fetch.maxLength < 1000) {
        errors.push("fetch.maxLength 必须大于等于 1000 字节");
      } else if (config.fetch.maxLength > 500000) {
        warnings.push("fetch.maxLength 超过 500KB 可能导致内存问题");
      }
    }

    if (config.fetch.timeoutMs !== undefined) {
      if (typeof config.fetch.timeoutMs !== "number" || config.fetch.timeoutMs < 1000) {
        errors.push("fetch.timeoutMs 必须大于等于 1000 毫秒");
      }
    }

    if (config.fetch.defaultWaitUntil !== undefined) {
      const validWaitUntil = ["domcontentloaded", "networkidle", "load"];
      if (!validWaitUntil.includes(config.fetch.defaultWaitUntil)) {
        errors.push(`fetch.defaultWaitUntil 必须是 ${validWaitUntil.join(", ")} 之一`);
      }
    }
  }

  if (config.extractor !== undefined) {
    if (config.extractor.defaultMode !== undefined) {
      const validModes: WebContentExtractMode[] = ["markdown", "text", "html"];
      if (!validModes.includes(config.extractor.defaultMode)) {
        errors.push(`extractor.defaultMode 必须是 ${validModes.join(", ")} 之一`);
      }
    }

    if (config.extractor.maxLength !== undefined) {
      if (typeof config.extractor.maxLength !== "number" || config.extractor.maxLength < 1000) {
        errors.push("extractor.maxLength 必须大于等于 1000 字节");
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ==================== 配置合并 ====================

export function mergeWebToolsConfig(
  base: WebToolsConfig = DEFAULT_WEB_TOOLS_CONFIG,
  overrides: Partial<WebToolsConfig> = {},
): WebToolsConfig {
  return {
    enabled: overrides.enabled ?? base.enabled,
    search: {
      ...base.search,
      ...overrides.search,
    },
    fetch: {
      ...base.fetch,
      ...overrides.fetch,
    },
    extractor: {
      ...base.extractor,
      ...overrides.extractor,
    },
  };
}
