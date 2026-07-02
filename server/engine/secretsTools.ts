/**
 * Secrets Tools - 密钥管理工具集
 *
 * 提供密钥解析、设置、删除、验证等工具，用于 AI Agent 管理密钥
 */

import type { ToolDefinition } from '../aiClient.js';
import type { ToolHandler } from './toolTypes.js';
import {
  resolveSecretRef,
  setSecret,
  removeSecret,
  validateSecretRef,
  getSecretsManagerStatus,
} from './secretsManager.js';
import type { SecretProvider } from './secretsTypes.js';

function jsonResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function getResolveSecretToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'secrets_resolve',
      description: '解析密钥引用，获取密钥值。支持 env、encrypted、file、keychain 四种提供者。',
      parameters: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['env', 'encrypted', 'file', 'keychain'],
            description: '密钥提供者类型',
          },
          key: {
            type: 'string',
            description: '密钥标识符',
          },
          source: {
            type: 'string',
            description: '访问来源标识（可选）',
          },
          useCache: {
            type: 'boolean',
            description: '是否使用缓存（默认 true）',
          },
        },
        required: ['provider', 'key'],
      },
    },
  };
}

export function createResolveSecretToolHandler(): ToolHandler {
  return async (args: Record<string, unknown>) => {
    try {
      const provider = args.provider as SecretProvider;
      const key = args.key as string;
      const source = (args.source as string) || 'agent';
      const useCache = (args.useCache as boolean) !== false;

      const result = resolveSecretRef({ provider, key }, source, useCache);
      return jsonResult(result || { error: '密钥解析失败' });
    } catch (e) {
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

export function getSetSecretToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'secrets_set',
      description: '设置密钥（存储到加密存储）。如果密钥已存在则更新。',
      parameters: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['encrypted', 'keychain'],
            description: '密钥提供者类型（仅支持 encrypted 和 keychain）',
          },
          key: {
            type: 'string',
            description: '密钥标识符',
          },
          value: {
            type: 'string',
            description: '密钥值（明文）',
          },
          type: {
            type: 'string',
            enum: ['api_key', 'password', 'token', 'certificate', 'ssh_key', 'other'],
            description: '密钥类型（可选）',
          },
          description: {
            type: 'string',
            description: '密钥描述（可选）',
          },
        },
        required: ['provider', 'key', 'value'],
      },
    },
  };
}

export function createSetSecretToolHandler(): ToolHandler {
  return async (args: Record<string, unknown>) => {
    try {
      const provider = args.provider as SecretProvider;
      const key = args.key as string;
      const value = args.value as string;
      const type = args.type as ('api_key' | 'password' | 'token' | 'certificate' | 'ssh_key' | 'other') | undefined;
      const description = (args.description as string) || undefined;

      setSecret(provider, key, value, type, description);
      return jsonResult({ status: 'success', message: '密钥已设置' });
    } catch (e) {
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

export function getRemoveSecretToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'secrets_remove',
      description: '删除密钥。',
      parameters: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['encrypted', 'keychain'],
            description: '密钥提供者类型',
          },
          key: {
            type: 'string',
            description: '密钥标识符',
          },
        },
        required: ['provider', 'key'],
      },
    },
  };
}

export function createRemoveSecretToolHandler(): ToolHandler {
  return async (args: Record<string, unknown>) => {
    try {
      const provider = args.provider as SecretProvider;
      const key = args.key as string;

      const success = removeSecret(provider, key);
      return jsonResult({ status: success ? 'success' : 'failed', message: success ? '密钥已删除' : '密钥不存在' });
    } catch (e) {
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

export function getValidateSecretToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'secrets_validate',
      description: '验证密钥是否存在。',
      parameters: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['env', 'encrypted', 'file', 'keychain'],
            description: '密钥提供者类型',
          },
          key: {
            type: 'string',
            description: '密钥标识符',
          },
        },
        required: ['provider', 'key'],
      },
    },
  };
}

export function createValidateSecretToolHandler(): ToolHandler {
  return async (args: Record<string, unknown>) => {
    try {
      const provider = args.provider as SecretProvider;
      const key = args.key as string;

      const exists = validateSecretRef({ provider, key });
      return jsonResult({ exists });
    } catch (e) {
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

export function getSecretsStatusToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'secrets_status',
      description: '获取密钥管理器状态信息。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  };
}

export function createSecretsStatusToolHandler(): ToolHandler {
  return async () => {
    try {
      const status = getSecretsManagerStatus();
      return jsonResult(status);
    } catch (e) {
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

export function getSecretsToolDefinitions(): ToolDefinition[] {
  return [
    getResolveSecretToolDefinition(),
    getSetSecretToolDefinition(),
    getRemoveSecretToolDefinition(),
    getValidateSecretToolDefinition(),
    getSecretsStatusToolDefinition(),
  ];
}

export function getSecretsToolHandlers(): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  handlers.set('secrets_resolve', createResolveSecretToolHandler());
  handlers.set('secrets_set', createSetSecretToolHandler());
  handlers.set('secrets_remove', createRemoveSecretToolHandler());
  handlers.set('secrets_validate', createValidateSecretToolHandler());
  handlers.set('secrets_status', createSecretsStatusToolHandler());
  return handlers;
}