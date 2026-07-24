import { logger } from '../logger.js';

export type ConfigValidationSeverity = 'error' | 'warning' | 'info';

export interface ConfigValidationIssue {
  code: string;
  severity: ConfigValidationSeverity;
  message: string;
  path: string;
  value?: unknown;
  fix?: string;
  lineNumber?: number;
}

export interface ConfigValidationResult {
  isValid: boolean;
  issues: ConfigValidationIssue[];
  errorCount: number;
  warningCount: number;
}

export interface ConfigFieldHint {
  path: string;
  label: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'password';
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  sensitive?: boolean;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
}

export interface ConfigUiHints {
  fields: ConfigFieldHint[];
  sections: Array<{ id: string; label: string; path: string; fields: string[] }>;
}

export interface ConfigSchemaField {
  type: string | string[];
  description?: string;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  enum?: string[];
  properties?: Record<string, ConfigSchemaField>;
  items?: ConfigSchemaField;
}

export interface ConfigSchema {
  type: 'object';
  properties: Record<string, ConfigSchemaField>;
  required?: string[];
}

export class ConfigValidator {
  private schema: ConfigSchema;
  private sensitivePaths = new Set<string>();

  constructor(schema: ConfigSchema) {
    this.schema = schema;
    this.discoverSensitivePaths();
  }

  private discoverSensitivePaths(): void {
    const sensitiveKeywords = ['apiKey', 'api_key', 'secret', 'password', 'token', 'credential', 'key'];
    this.walkSchema(this.schema, '', (path, field) => {
      const pathLower = path.toLowerCase();
      const fieldLower = field.description?.toLowerCase() ?? '';
      if (
        sensitiveKeywords.some((kw) => pathLower.includes(kw)) ||
        sensitiveKeywords.some((kw) => fieldLower.includes(kw))
      ) {
        this.sensitivePaths.add(path);
      }
    });
  }

  private walkSchema(
    schema: ConfigSchema | ConfigSchemaField,
    currentPath: string,
    callback: (path: string, field: ConfigSchemaField) => void,
  ): void {
    if (schema.properties) {
      for (const [key, value] of Object.entries(schema.properties)) {
        const path = currentPath ? `${currentPath}.${key}` : key;
        callback(path, value);
        this.walkSchema(value, path, callback);
      }
    }
    if ('items' in schema && schema.items) {
      this.walkSchema(schema.items, `${currentPath}[]`, callback);
    }
  }

  validate(config: Record<string, unknown>): ConfigValidationResult {
    const issues: ConfigValidationIssue[] = [];
    this.validateSchema({ type: 'object', properties: this.schema.properties } as ConfigSchemaField, config, '', issues);

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;

    return {
      isValid: errorCount === 0,
      issues,
      errorCount,
      warningCount,
    };
  }

  private validateSchema(
    schema: ConfigSchemaField,
    value: unknown,
    path: string,
    issues: ConfigValidationIssue[],
  ): void {
    if (schema.required && value === undefined) {
      issues.push({
        code: 'REQUIRED',
        severity: 'error',
        message: `${path} is required`,
        path,
        fix: `Add ${path} to the configuration`,
      });
      return;
    }

    if (value === undefined) {
      return;
    }

    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.includes(typeof value) && !(types.includes('array') && Array.isArray(value))) {
      issues.push({
        code: 'TYPE_MISMATCH',
        severity: 'error',
        message: `${path} should be of type ${types.join(', ')}`,
        path,
        value,
        fix: `Change ${path} to a ${types.join(' or ')}`,
      });
      return;
    }

    if (schema.min !== undefined && typeof value === 'number' && value < schema.min) {
      issues.push({
        code: 'MIN_VALUE',
        severity: 'error',
        message: `${path} should be at least ${schema.min}`,
        path,
        value,
        fix: `Set ${path} to ${schema.min} or higher`,
      });
    }

    if (schema.max !== undefined && typeof value === 'number' && value > schema.max) {
      issues.push({
        code: 'MAX_VALUE',
        severity: 'error',
        message: `${path} should be at most ${schema.max}`,
        path,
        value,
        fix: `Set ${path} to ${schema.max} or lower`,
      });
    }

    if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
      issues.push({
        code: 'PATTERN_MISMATCH',
        severity: 'error',
        message: `${path} does not match the required pattern`,
        path,
        value,
        fix: `Ensure ${path} matches pattern: ${schema.pattern}`,
      });
    }

    if (schema.enum && typeof value === 'string' && !schema.enum.includes(value)) {
      issues.push({
        code: 'INVALID_ENUM',
        severity: 'error',
        message: `${path} must be one of: ${schema.enum.join(', ')}`,
        path,
        value,
        fix: `Set ${path} to one of: ${schema.enum.join(', ')}`,
      });
    }

    if (schema.properties && typeof value === 'object' && value !== null) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const propPath = path ? `${path}.${key}` : key;
        this.validateSchema(propSchema, (value as Record<string, unknown>)[key], propPath, issues);
      }
    }

    if (schema.items && Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        this.validateSchema(schema.items, value[i], `${path}[${i}]`, issues);
      }
    }

    this.validateSensitiveValue(path, value, issues);
  }

  private validateSensitiveValue(path: string, value: unknown, issues: ConfigValidationIssue[]): void {
    if (this.sensitivePaths.has(path)) {
      if (typeof value === 'string' && value.length === 0) {
        issues.push({
          code: 'EMPTY_SECRET',
          severity: 'warning',
          message: `${path} is empty but expected to contain sensitive credentials`,
          path,
          fix: `Provide a valid value for ${path}`,
        });
      }

      if (typeof value === 'string' && value.includes(' ') && value.length < 20) {
        issues.push({
          code: 'WEAK_SECRET',
          severity: 'warning',
          message: `${path} may be a weak credential`,
          path,
          fix: `Consider using a more secure value for ${path}`,
        });
      }
    }
  }

  generateUiHints(): ConfigUiHints {
    const fields: ConfigFieldHint[] = [];
    const sections: Array<{ id: string; label: string; path: string; fields: string[] }> = [];

    this.walkSchema(this.schema, '', (path, field) => {
      const fieldHint: ConfigFieldHint = {
        path,
        label: path.split('.').pop()?.replace(/([A-Z])/g, ' $1').trim() ?? path,
        description: field.description ?? '',
        type: this.inferFieldType(field),
        required: field.required ?? false,
        min: field.min,
        max: field.max,
        pattern: field.pattern,
        sensitive: this.sensitivePaths.has(path),
      };

      if (field.enum) {
        fieldHint.options = field.enum.map((e) => ({ value: e, label: e }));
      }

      if (fieldHint.sensitive) {
        fieldHint.placeholder = '********';
      }

      fields.push(fieldHint);

      const sectionPath = path.split('.')[0];
      const existingSection = sections.find((s) => s.path === sectionPath);
      if (existingSection) {
        existingSection.fields.push(path);
      } else {
        sections.push({
          id: sectionPath,
          label: sectionPath.replace(/([A-Z])/g, ' $1').trim(),
          path: sectionPath,
          fields: [path],
        });
      }
    });

    return { fields, sections };
  }

  private inferFieldType(field: ConfigSchemaField): ConfigFieldHint['type'] {
    if (this.sensitivePaths.has(field.description?.toLowerCase() ?? '')) {
      return 'password';
    }

    const type = Array.isArray(field.type) ? field.type[0] : field.type;
    switch (type) {
      case 'string':
        return this.sensitivePaths.has(field.description?.toLowerCase() ?? '') ? 'password' : 'string';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'array':
        return 'array';
      case 'object':
        return 'object';
      default:
        return 'string';
    }
  }

  isSensitive(path: string): boolean {
    return this.sensitivePaths.has(path);
  }

  getSchema(): ConfigSchema {
    return this.schema;
  }
}

export const defaultConfigSchema: ConfigSchema = {
  type: 'object',
  properties: {
    server: {
      type: 'object',
      description: 'Server configuration',
      required: true,
      properties: {
        port: { type: 'number', description: 'Server port', min: 1, max: 65535, required: true },
        host: { type: 'string', description: 'Server host', required: true },
        basePath: { type: 'string', description: 'API base path' },
        timeout: { type: 'number', description: 'Request timeout in milliseconds', min: 1000 },
      },
    },
    security: {
      type: 'object',
      description: 'Security configuration',
      required: true,
      properties: {
        apiKey: { type: 'string', description: 'API key for authentication', required: true },
        enableAuth: { type: 'boolean', description: 'Enable authentication' },
        cors: {
          type: 'object',
          description: 'CORS configuration',
          properties: {
            origin: { type: 'array', description: 'Allowed origins', items: { type: 'string' } },
            methods: { type: 'array', description: 'Allowed methods', items: { type: 'string' } },
          },
        },
      },
    },
    logging: {
      type: 'object',
      description: 'Logging configuration',
      properties: {
        level: { type: 'string', description: 'Log level', enum: ['debug', 'info', 'warn', 'error'] },
        format: { type: 'string', description: 'Log format', enum: ['json', 'text'] },
        maxFileSize: { type: 'number', description: 'Max log file size in bytes' },
        maxFiles: { type: 'number', description: 'Max number of log files', min: 1 },
      },
    },
    ai: {
      type: 'object',
      description: 'AI configuration',
      properties: {
        defaultProvider: { type: 'string', description: 'Default AI provider' },
        defaultModel: { type: 'string', description: 'Default AI model' },
        apiEndpoint: { type: 'string', description: 'AI API endpoint' },
        apiKey: { type: 'string', description: 'AI API key' },
        temperature: { type: 'number', description: 'Temperature for generation', min: 0, max: 2 },
        maxTokens: { type: 'number', description: 'Max tokens for generation', min: 1 },
      },
    },
    database: {
      type: 'object',
      description: 'Database configuration',
      properties: {
        type: { type: 'string', description: 'Database type', enum: ['sqlite', 'postgres', 'mysql'] },
        host: { type: 'string', description: 'Database host' },
        port: { type: 'number', description: 'Database port', min: 1, max: 65535 },
        name: { type: 'string', description: 'Database name', required: true },
        username: { type: 'string', description: 'Database username' },
        password: { type: 'string', description: 'Database password' },
      },
    },
    sessions: {
      type: 'object',
      description: 'Session configuration',
      properties: {
        maxAge: { type: 'number', description: 'Session max age in seconds' },
        storage: { type: 'string', description: 'Session storage type', enum: ['memory', 'redis'] },
        cleanupInterval: { type: 'number', description: 'Cleanup interval in seconds' },
      },
    },
  },
};

export const configValidator = new ConfigValidator(defaultConfigSchema);

export function validateConfig(config: Record<string, unknown>): ConfigValidationResult {
  logger.debug('[ConfigValidator] Validating configuration');
  const result = configValidator.validate(config);

  if (result.errorCount > 0) {
    logger.error(`[ConfigValidator] Configuration validation failed with ${result.errorCount} errors`);
    for (const issue of result.issues.filter((i) => i.severity === 'error')) {
      logger.error(`[ConfigValidator] ${issue.path}: ${issue.message}`);
    }
  }

  if (result.warningCount > 0) {
    logger.warn(`[ConfigValidator] Configuration validation produced ${result.warningCount} warnings`);
    for (const issue of result.issues.filter((i) => i.severity === 'warning')) {
      logger.warn(`[ConfigValidator] ${issue.path}: ${issue.message}`);
    }
  }

  return result;
}

export function generateConfigUiHints(): ConfigUiHints {
  return configValidator.generateUiHints();
}