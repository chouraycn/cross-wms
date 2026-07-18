// 移植自 openclaw/src/config/env-substitution.ts
// 配置值的环境变量替换。
//
// 支持 `${VAR_NAME}` 语法在字符串值中，于配置加载时替换。
// - 仅匹配大写环境变量：`[A-Z_][A-Z0-9_]*`
// - 用 `$${}` 转义以输出字面 `${}`
// - 缺失的环境变量抛出带上下文的 `MissingEnvVarError`
//
// 调整说明：源文件依赖 ../utils.js 的 isPlainObject。cross-wms 该函数位于
// ../infra/plain-object.js。

import { isPlainObject } from '../infra/plain-object.js';

// 有效大写环境变量名模式：以字母或下划线开头，后接字母、数字或下划线（全大写）
const ENV_VAR_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

/** 当配置值引用缺失或空的环境变量时抛出的错误。 */
export class MissingEnvVarError extends Error {
  constructor(
    public readonly varName: string,
    public readonly configPath: string,
  ) {
    super(`Missing env var "${varName}" referenced at config path: ${configPath}`);
    this.name = 'MissingEnvVarError';
  }
}

type EnvToken =
  | { kind: 'escaped'; name: string; end: number }
  | { kind: 'substitution'; name: string; end: number };

function parseEnvTokenAt(value: string, index: number): EnvToken | null {
  if (value[index] !== '$') {
    return null;
  }

  const next = value[index + 1];
  const afterNext = value[index + 2];

  // 转义：$${VAR} -> ${VAR}
  if (next === '$' && afterNext === '{') {
    // 在替换之前解析转义占位符，使 "$${VAR}" 永不从 env 解析。
    const start = index + 3;
    const end = value.indexOf('}', start);
    if (end !== -1) {
      const name = value.slice(start, end);
      if (ENV_VAR_NAME_PATTERN.test(name)) {
        return { kind: 'escaped', name, end };
      }
    }
  }

  // 替换：${VAR} -> value
  if (next === '{') {
    const start = index + 2;
    const end = value.indexOf('}', start);
    if (end !== -1) {
      const name = value.slice(start, end);
      if (ENV_VAR_NAME_PATTERN.test(name)) {
        return { kind: 'substitution', name, end };
      }
    }
  }

  return null;
}

/** 当替换配置为继续时发出的缺失环境变量警告。 */
export type EnvSubstitutionWarning = {
  varName: string;
  configPath: string;
};

type SubstituteOptions = {
  /** 设置后，缺失变量调用此函数而非抛出异常，并保留原始占位符。 */
  onMissing?: (warning: EnvSubstitutionWarning) => void;
};

function substituteString(
  value: string,
  env: NodeJS.ProcessEnv,
  configPath: string,
  opts?: SubstituteOptions,
): string {
  if (!value.includes('$')) {
    return value;
  }

  const chunks: string[] = [];

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char !== '$') {
      chunks.push(char);
      continue;
    }

    const token = parseEnvTokenAt(value, i);
    if (token?.kind === 'escaped') {
      chunks.push(`\${${token.name}}`);
      i = token.end;
      continue;
    }
    if (token?.kind === 'substitution') {
      const envValue = env[token.name];
      if (envValue === undefined || envValue === '') {
        if (opts?.onMissing) {
          opts.onMissing({ varName: token.name, configPath });
          // 保留原始占位符使值可见地未解析。
          chunks.push(`\${${token.name}}`);
          i = token.end;
          continue;
        }
        throw new MissingEnvVarError(token.name, configPath);
      }
      chunks.push(envValue);
      i = token.end;
      continue;
    }

    // 非识别模式则保持不变
    chunks.push(char);
  }

  return chunks.join('');
}

/** 检测未转义的 `${VAR}` 引用，不把转义的 `$${VAR}` 视为引用。 */
export function containsEnvVarReference(value: string): boolean {
  if (!value.includes('$')) {
    return false;
  }

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char !== '$') {
      continue;
    }

    const token = parseEnvTokenAt(value, i);
    if (token?.kind === 'escaped') {
      i = token.end;
      continue;
    }
    if (token?.kind === 'substitution') {
      return true;
    }
  }

  return false;
}

function substituteAny(
  value: unknown,
  env: NodeJS.ProcessEnv,
  path: string,
  opts?: SubstituteOptions,
): unknown {
  if (typeof value === 'string') {
    return substituteString(value, env, path, opts);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => substituteAny(item, env, `${path}[${index}]`, opts));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      result[key] = substituteAny(val, env, childPath, opts);
    }
    return result;
  }

  // 原始类型（number、boolean、null）原样通过
  return value;
}

/**
 * 解析配置值中的 `${VAR_NAME}` 环境变量引用。
 *
 * @param obj - 已解析的配置对象（JSON5 解析和 $include 解析之后）
 * @param env - 用于替换的环境变量（默认为 process.env）
 * @param opts - 选项：`onMissing` 回调收集警告而非抛出。
 * @returns 替换环境变量后的配置对象
 * @throws {MissingEnvVarError} 当引用的环境变量未设置或为空（除非设置 `onMissing`）
 */
export function resolveConfigEnvVars(
  obj: unknown,
  env: NodeJS.ProcessEnv = process.env,
  opts?: SubstituteOptions,
): unknown {
  return substituteAny(obj, env, '', opts);
}
