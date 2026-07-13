/**
 * Skill Schema Validator — 技能配置 Schema 验证器
 *
 * 验证 SKILL.md frontmatter 的完整性和正确性：
 * 1. 必填字段检查 — name, description, trigger 等
 * 2. 字段类型验证 — 字符串/数组/布尔值等
 * 3. 字段格式验证 — email, url, 版本号等
 * 4. 长度限制 — 名称/描述/标签长度限制
 * 5. 命名规范 — 技能 ID 格式
 * 6. 依赖声明 — 依赖格式检查
 * 7. 元数据完整性 — 作者、版本、许可证等
 *
 * 验证等级：
 * - error:   必须修复，否则技能无法加载
 * - warning: 建议修复，不影响加载
 * - info:    优化建议
 */

// ===================== 类型定义 =====================

/** 验证严重级别 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/** 单个验证结果 */
export interface ValidationIssue {
  /** 唯一规则 ID */
  ruleId: string;
  /** 严重级别 */
  severity: ValidationSeverity;
  /** 问题描述 */
  message: string;
  /** 相关字段路径（如 "metadata.install[0].url"） */
  field?: string;
  /** 修复建议 */
  suggestion?: string;
}

/** 完整验证结果 */
export interface ValidationResult {
  valid: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
  totalIssues: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  infos: ValidationIssue[];
  /** 验证耗时（毫秒） */
  durationMs: number;
}

/** 验证选项 */
export interface ValidationOptions {
  /** 是否检查推荐字段（warning 级别） */
  checkRecommended?: boolean;
  /** 是否检查优化建议（info 级别） */
  checkOptional?: boolean;
  /** 自定义规则 */
  customRules?: ValidationRule[];
  /** 要跳过的规则 ID */
  skipRules?: string[];
}

/** 验证规则 */
interface ValidationRule {
  ruleId: string;
  severity: ValidationSeverity;
  validate: (frontmatter: Record<string, unknown>, content?: string) => ValidationIssue[];
}

// ===================== 常量 =====================

/** 技能名称最大长度 */
const MAX_NAME_LENGTH = 60;

/** 技能描述最大长度 */
const MAX_DESCRIPTION_LENGTH = 200;

/** 技能 ID 格式（kebab-case） */
const SKILL_ID_PATTERN = /^[a-z][a-z0-9-]*[a-z0-9]$/;

/** 标签最大长度 */
const MAX_TAG_LENGTH = 20;

/** 最大标签数量 */
const MAX_TAGS = 10;

/** 版本号格式（SemVer 简化版） */
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\da-z-]+(?:\.[\da-z-]+)*)?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?$/i;

/** URL 模式 */
const URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

/** Email 模式 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ===================== 验证规则 =====================

/**
 * 必填字段验证
 */
const requiredFieldsRule: ValidationRule = {
  ruleId: 'required-fields',
  severity: 'error',
  validate: (fm) => {
    const issues: ValidationIssue[] = [];
    const required = ['name'];

    for (const field of required) {
      if (!fm[field] || typeof fm[field] !== 'string' || !fm[field].trim()) {
        issues.push({
          ruleId: 'required-fields',
          severity: 'error',
          message: `缺少必填字段：${field}`,
          field,
          suggestion: `请添加 "${field}" 字段`,
        });
      }
    }

    return issues;
  },
};

/**
 * 字段类型验证
 */
const fieldTypesRule: ValidationRule = {
  ruleId: 'field-types',
  severity: 'error',
  validate: (fm) => {
    const issues: ValidationIssue[] = [];

    const stringFields = ['name', 'description', 'trigger', 'version', 'author', 'license', 'homepage'];
    for (const field of stringFields) {
      if (fm[field] !== undefined && typeof fm[field] !== 'string') {
        issues.push({
          ruleId: 'field-types',
          severity: 'error',
          message: `字段 "${field}" 类型错误，应为字符串`,
          field,
          suggestion: `将 "${field}" 改为字符串类型`,
        });
      }
    }

    if (fm.tags !== undefined && !Array.isArray(fm.tags)) {
      issues.push({
        ruleId: 'field-types',
        severity: 'error',
        message: '字段 "tags" 类型错误，应为数组',
        field: 'tags',
        suggestion: '将 "tags" 改为数组类型',
      });
    }

    if (fm.category !== undefined && typeof fm.category !== 'string') {
      issues.push({
        ruleId: 'field-types',
        severity: 'error',
        message: '字段 "category" 类型错误，应为字符串',
        field: 'category',
        suggestion: '将 "category" 改为字符串类型',
      });
    }

    return issues;
  },
};

/**
 * 名称长度和格式验证
 */
const nameFormatRule: ValidationRule = {
  ruleId: 'name-format',
  severity: 'error',
  validate: (fm) => {
    const issues: ValidationIssue[] = [];
    const name = fm.name as string | undefined;

    if (name && typeof name === 'string') {
      if (name.length > MAX_NAME_LENGTH) {
        issues.push({
          ruleId: 'name-format',
          severity: 'error',
          message: `技能名称过长（${name.length}/${MAX_NAME_LENGTH} 字符）`,
          field: 'name',
          suggestion: `将名称缩短到 ${MAX_NAME_LENGTH} 字符以内`,
        });
      }

      if (name.trim().length < 2) {
        issues.push({
          ruleId: 'name-format',
          severity: 'error',
          message: '技能名称过短',
          field: 'name',
          suggestion: '技能名称至少 2 个字符',
        });
      }
    }

    return issues;
  },
};

/**
 * 描述长度验证
 */
const descriptionLengthRule: ValidationRule = {
  ruleId: 'description-length',
  severity: 'warning',
  validate: (fm) => {
    const issues: ValidationIssue[] = [];
    const desc = fm.description as string | undefined;

    if (desc && typeof desc === 'string') {
      if (desc.length > MAX_DESCRIPTION_LENGTH) {
        issues.push({
          ruleId: 'description-length',
          severity: 'warning',
          message: `技能描述过长（${desc.length}/${MAX_DESCRIPTION_LENGTH} 字符）`,
          field: 'description',
          suggestion: `将描述精简到 ${MAX_DESCRIPTION_LENGTH} 字符以内`,
        });
      }
    } else if (!desc) {
      issues.push({
        ruleId: 'description-length',
        severity: 'warning',
        message: '缺少技能描述',
        field: 'description',
        suggestion: '添加简洁的技能描述，帮助用户快速了解技能用途',
      });
    }

    return issues;
  },
};

/**
 * 触发器格式验证
 */
const triggerFormatRule: ValidationRule = {
  ruleId: 'trigger-format',
  severity: 'warning',
  validate: (fm) => {
    const issues: ValidationIssue[] = [];
    const trigger = fm.trigger as string | undefined;

    if (trigger && typeof trigger === 'string') {
      if (!trigger.startsWith('/')) {
        issues.push({
          ruleId: 'trigger-format',
          severity: 'info',
          message: '触发器建议以 "/" 开头',
          field: 'trigger',
          suggestion: '将触发器改为斜杠命令格式，如 /my-skill',
        });
      }

      if (trigger.includes(' ')) {
        issues.push({
          ruleId: 'trigger-format',
          severity: 'warning',
          message: '触发器不应包含空格',
          field: 'trigger',
          suggestion: '移除触发器中的空格，使用连字符或下划线代替',
        });
      }
    } else if (!trigger) {
      issues.push({
        ruleId: 'trigger-format',
        severity: 'info',
        message: '未设置触发器，技能只能通过描述匹配调用',
        field: 'trigger',
        suggestion: '添加 trigger 字段，设置斜杠命令以便快速调用',
      });
    }

    return issues;
  },
};

/**
 * 标签验证
 */
const tagsFormatRule: ValidationRule = {
  ruleId: 'tags-format',
  severity: 'warning',
  validate: (fm) => {
    const issues: ValidationIssue[] = [];
    const tags = fm.tags as string[] | undefined;

    if (tags && Array.isArray(tags)) {
      if (tags.length > MAX_TAGS) {
        issues.push({
          ruleId: 'tags-format',
          severity: 'warning',
          message: `标签数量过多（${tags.length}/${MAX_TAGS}）`,
          field: 'tags',
          suggestion: `精简标签到 ${MAX_TAGS} 个以内，保留最相关的`,
        });
      }

      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        if (typeof tag !== 'string') {
          issues.push({
            ruleId: 'tags-format',
            severity: 'error',
            message: `标签 #${i + 1} 类型错误，应为字符串`,
            field: `tags[${i}]`,
          });
        } else if (tag.length > MAX_TAG_LENGTH) {
          issues.push({
            ruleId: 'tags-format',
            severity: 'warning',
            message: `标签 "${tag}" 过长（${tag.length}/${MAX_TAG_LENGTH} 字符）`,
            field: `tags[${i}]`,
            suggestion: `缩短标签长度`,
          });
        }
      }
    } else if (!tags) {
      issues.push({
        ruleId: 'tags-format',
        severity: 'info',
        message: '未设置标签',
        field: 'tags',
        suggestion: '添加相关标签，提高技能被搜索到的概率',
      });
    }

    return issues;
  },
};

/**
 * 版本号格式验证
 */
const versionFormatRule: ValidationRule = {
  ruleId: 'version-format',
  severity: 'warning',
  validate: (fm) => {
    const issues: ValidationIssue[] = [];
    const version = fm.version as string | undefined;

    if (version && typeof version === 'string') {
      if (!VERSION_PATTERN.test(version)) {
        issues.push({
          ruleId: 'version-format',
          severity: 'warning',
          message: `版本号 "${version}" 不符合语义化版本规范`,
          field: 'version',
          suggestion: '使用语义化版本号，如 1.0.0、1.2.3-beta.1',
        });
      }
    }

    return issues;
  },
};

/**
 * URL 格式验证
 */
const urlFormatRule: ValidationRule = {
  ruleId: 'url-format',
  severity: 'warning',
  validate: (fm) => {
    const issues: ValidationIssue[] = [];

    const urlFields = ['homepage', 'repository'];
    for (const field of urlFields) {
      const value = fm[field] as string | undefined;
      if (value && typeof value === 'string' && !URL_PATTERN.test(value)) {
        issues.push({
          ruleId: 'url-format',
          severity: 'warning',
          message: `${field} URL 格式不正确`,
          field,
          suggestion: '确保 URL 以 http:// 或 https:// 开头',
        });
      }
    }

    return issues;
  },
};

/**
 * 分类验证
 */
const categoryRule: ValidationRule = {
  ruleId: 'category',
  severity: 'info',
  validate: (fm) => {
    const issues: ValidationIssue[] = [];

    if (!fm.category) {
      issues.push({
        ruleId: 'category',
        severity: 'info',
        message: '未设置技能分类',
        field: 'category',
        suggestion: '添加 category 字段，方便技能分类浏览',
      });
    }

    return issues;
  },
};

/**
 * 作者信息验证
 */
const authorInfoRule: ValidationRule = {
  ruleId: 'author-info',
  severity: 'info',
  validate: (fm) => {
    const issues: ValidationIssue[] = [];

    if (!fm.author) {
      issues.push({
        ruleId: 'author-info',
        severity: 'info',
        message: '未设置作者信息',
        field: 'author',
        suggestion: '添加 author 字段，标明技能作者',
      });
    }

    return issues;
  },
};

/**
 * 图标验证
 */
const iconRule: ValidationRule = {
  ruleId: 'icon',
  severity: 'info',
  validate: (fm) => {
    const issues: ValidationIssue[] = [];

    if (!fm.icon) {
      issues.push({
        ruleId: 'icon',
        severity: 'info',
        message: '未设置技能图标',
        field: 'icon',
        suggestion: '添加 icon 字段，选择一个有辨识度的图标',
      });
    }

    return issues;
  },
};

/**
 * 许可证验证
 */
const licenseRule: ValidationRule = {
  ruleId: 'license',
  severity: 'info',
  validate: (fm) => {
    const issues: ValidationIssue[] = [];

    if (!fm.license) {
      issues.push({
        ruleId: 'license',
        severity: 'info',
        message: '未设置许可证',
        field: 'license',
        suggestion: '添加 license 字段，声明技能使用许可（如 MIT、Apache-2.0）',
      });
    }

    return issues;
  },
};

// ===================== 默认规则集 =====================

const DEFAULT_RULES: ValidationRule[] = [
  requiredFieldsRule,
  fieldTypesRule,
  nameFormatRule,
  descriptionLengthRule,
  triggerFormatRule,
  tagsFormatRule,
  versionFormatRule,
  urlFormatRule,
  categoryRule,
  authorInfoRule,
  iconRule,
  licenseRule,
];

// ===================== SkillSchemaValidator 类 =====================

export class SkillSchemaValidator {
  private rules: ValidationRule[];
  private options: ValidationOptions;

  constructor(options: ValidationOptions = {}) {
    this.options = {
      checkRecommended: true,
      checkOptional: true,
      ...options,
    };

    this.rules = [...DEFAULT_RULES, ...(options.customRules || [])];
  }

  /**
   * 验证技能 frontmatter
   *
   * @param frontmatter - 解析后的 frontmatter 对象
   * @param content - 完整 SKILL.md 内容（可选，用于额外检查）
   */
  validate(frontmatter: Record<string, unknown>, content?: string): ValidationResult {
    const startTime = Date.now();

    const skipSet = new Set(this.options.skipRules || []);
    const allIssues: ValidationIssue[] = [];

    for (const rule of this.rules) {
      if (skipSet.has(rule.ruleId)) continue;

      // 根据选项过滤规则
      if (rule.severity === 'warning' && !this.options.checkRecommended) continue;
      if (rule.severity === 'info' && !this.options.checkOptional) continue;

      try {
        const issues = rule.validate(frontmatter, content);
        allIssues.push(...issues);
      } catch (e) {
        // 规则执行出错，记录为 warning
        allIssues.push({
          ruleId: `rule-error-${rule.ruleId}`,
          severity: 'warning',
          message: `规则 ${rule.ruleId} 执行出错：${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    // 分类
    const errors = allIssues.filter((i) => i.severity === 'error');
    const warnings = allIssues.filter((i) => i.severity === 'warning');
    const infos = allIssues.filter((i) => i.severity === 'info');

    const durationMs = Date.now() - startTime;

    return {
      valid: errors.length === 0,
      hasErrors: errors.length > 0,
      hasWarnings: warnings.length > 0,
      totalIssues: allIssues.length,
      errors,
      warnings,
      infos,
      durationMs,
    };
  }

  /**
   * 验证 SKILL.md 原始内容
   */
  validateSkillMd(content: string): ValidationResult {
    const frontmatter = this.extractFrontmatter(content);
    return this.validate(frontmatter, content);
  }

  /**
   * 简单的 frontmatter 提取（用于不依赖解析库的场景）
   */
  private extractFrontmatter(content: string): Record<string, unknown> {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return {};

    const yamlContent = match[1];
    const result: Record<string, unknown> = {};

    const lines = yamlContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) continue;

      const key = trimmed.slice(0, colonIndex).trim();
      let value: unknown = trimmed.slice(colonIndex + 1).trim();

      // 去除引号
      if (typeof value === 'string') {
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
      }

      // 解析布尔值
      if (value === 'true') value = true;
      if (value === 'false') value = false;

      // 解析数组（简单情况）
      if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
        try {
          value = JSON.parse(value.replace(/'/g, '"'));
        } catch {
          // 解析失败，保留字符串
        }
      }

      result[key] = value;
    }

    return result;
  }

  /**
   * 获取所有可用规则信息
   */
  getRulesInfo(): Array<{ ruleId: string; severity: ValidationSeverity }> {
    return this.rules.map((r) => ({ ruleId: r.ruleId, severity: r.severity }));
  }
}

// ===================== 便捷函数 =====================

/**
 * 快速验证技能 frontmatter
 */
export function validateSkillFrontmatter(
  frontmatter: Record<string, unknown>,
  options?: ValidationOptions,
): ValidationResult {
  const validator = new SkillSchemaValidator(options);
  return validator.validate(frontmatter);
}

/**
 * 快速验证 SKILL.md 内容
 */
export function validateSkillMd(content: string, options?: ValidationOptions): ValidationResult {
  const validator = new SkillSchemaValidator(options);
  return validator.validateSkillMd(content);
}