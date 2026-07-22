import { logger } from '../../logger.js';

export type ConfigValidationError = {
  path: string;
  message: string;
  severity: 'error' | 'warning';
};

export type ConfigSchema = {
  type: string;
  properties?: Record<string, ConfigSchema>;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  description?: string;
  additionalProperties?: boolean | ConfigSchema;
  items?: ConfigSchema;
};

export function resolveConfigSchema(): ConfigSchema {
  return {
    type: 'object',
    properties: {
      gateway: {
        type: 'object',
        properties: {
          port: { type: 'number', default: 3000, description: 'Gateway server port' },
          host: { type: 'string', default: '127.0.0.1', description: 'Gateway bind host' },
          auth: {
            type: 'object',
            properties: {
              mode: { type: 'string', enum: ['none', 'token', 'password', 'trusted-proxy'], default: 'none' },
              token: { type: 'string', description: 'Shared secret token' },
              password: { type: 'string', description: 'Shared password' },
            },
          },
        },
      },
      models: {
        type: 'object',
        properties: {
          default: { type: 'string', description: 'Default model ID' },
          providers: { type: 'object', additionalProperties: true },
        },
      },
      plugins: {
        type: 'object',
        properties: {
          directories: { type: 'array', items: { type: 'string' } },
          enabled: { type: 'array', items: { type: 'string' } },
        },
      },
      agents: {
        type: 'object',
        properties: {
          defaultTimeoutMs: { type: 'number', default: 120_000 },
          maxConcurrent: { type: 'number', default: 5 },
        },
      },
      logging: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'], default: 'info' },
          redactSecrets: { type: 'boolean', default: true },
        },
      },
      skills: {
        type: 'object',
        properties: {
          clawhub: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'ClawHub registry URL' },
              enabled: { type: 'boolean', default: true, description: 'Enable ClawHub integration' },
            },
          },
          snapshotIntervalMs: { type: 'number', default: 300000, description: 'Skill snapshot refresh interval in milliseconds' },
          envOverrides: { type: 'boolean', default: true, description: 'Enable environment variable overrides for skills' },
          remoteSync: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', default: false, description: 'Enable remote skill sync' },
              intervalMs: { type: 'number', default: 60000, description: 'Remote sync interval in milliseconds' },
              nodes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    nodeId: { type: 'string', description: 'Unique node identifier' },
                    nodeUrl: { type: 'string', description: 'Node URL' },
                    nodeName: { type: 'string', description: 'Human-readable node name' },
                    autoPull: { type: 'boolean', default: false, description: 'Auto-pull new skills' },
                  },
                },
                description: 'List of remote skill nodes',
              },
            },
          },
          security: {
            type: 'object',
            properties: {
              autoVerify: { type: 'boolean', default: true, description: 'Auto-verify skill security' },
              minScore: { type: 'number', default: 0.7, description: 'Minimum security score to allow installation' },
              cacheTtlMs: { type: 'number', default: 86400000, description: 'Security verdict cache TTL in milliseconds' },
            },
          },
          agentFilter: {
            type: 'object',
            properties: {
              defaultVisibility: { type: 'string', enum: ['all', 'whitelist', 'tagged'], default: 'all', description: 'Default skill visibility for agents' },
            },
          },
        },
      },
    },
  };
}

export function validateConfig(config: unknown, schema?: ConfigSchema): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];
  const resolvedSchema = schema ?? resolveConfigSchema();

  function validate(value: unknown, schema: ConfigSchema, path: string): void {
    if (schema.type === 'object' && typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      if (schema.required) {
        for (const key of schema.required) {
          if (!(key in obj)) {
            errors.push({ path: `${path}.${key}`, message: 'Missing required property', severity: 'error' });
          }
        }
      }
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in obj) {
            validate(obj[key], propSchema, `${path}.${key}`);
          }
        }
      }
    } else if (schema.enum && !schema.enum.includes(value)) {
      errors.push({
        path,
        message: `Value "${String(value)}" not in enum [${schema.enum.map(v => JSON.stringify(v)).join(', ')}]`,
        severity: 'error',
      });
    } else if (schema.type === 'number' && typeof value !== 'number') {
      errors.push({ path, message: `Expected number, got ${typeof value}`, severity: 'error' });
    } else if (schema.type === 'string' && typeof value !== 'string') {
      errors.push({ path, message: `Expected string, got ${typeof value}`, severity: 'error' });
    } else if (schema.type === 'boolean' && typeof value !== 'boolean') {
      errors.push({ path, message: `Expected boolean, got ${typeof value}`, severity: 'error' });
    }
  }

  validate(config, resolvedSchema, 'config');

  if (errors.length > 0) {
    logger.warn(`[Config] Found ${errors.length} validation issues`);
  }

  return errors;
}
