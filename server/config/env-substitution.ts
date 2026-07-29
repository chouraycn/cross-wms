/**
 * 环境变量替换（env-substitution）
 *
 * 参考 openclaw/src/config/env-substitution.ts：
 * - 支持 ${VAR_NAME} 语法在配置字符串中引用环境变量
 * - 仅匹配大写环境变量名：^[A-Z_][A-Z0-9_]*$
 * - $${VAR} 转义为字面量 ${VAR}
 * - 缺失环境变量时抛出 MissingEnvVarError，携带配置路径上下文
 * - preserveEnvVars(text, preserveList)：保留指定变量不替换（用于自引用场景）
 */

// 仅匹配大写环境变量名，避免误命中 ${foo} 这类小写占位符
const ENV_VAR_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

/** 配置值引用了未设置/空的环境变量时抛出 */
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
  if (value[index] !== '$') return null;
  const next = value[index + 1];
  const afterNext = value[index + 2];

  // 转义：$${VAR} -> ${VAR}
  if (next === '$' && afterNext === '{') {
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

function substituteString(
  value: string,
  env: NodeJS.ProcessEnv,
  configPath: string,
  preserveList?: Set<string>,
  onMissing?: (varName: string, configPath: string) => void,
): string {
  if (!value.includes('$')) return value;

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
      // 保留列表：不替换，原样输出 ${VAR}
      if (preserveList?.has(token.name)) {
        chunks.push(`\${${token.name}}`);
        i = token.end;
        continue;
      }
      const envValue = env[token.name];
      if (envValue === undefined || envValue === '') {
        if (onMissing) {
          onMissing(token.name, configPath);
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
    chunks.push(char);
  }
  return chunks.join('');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function substituteAny(
  value: unknown,
  env: NodeJS.ProcessEnv,
  path: string,
  preserveList: Set<string> | undefined,
  onMissing?: (varName: string, configPath: string) => void,
): unknown {
  if (typeof value === 'string') {
    return substituteString(value, env, path, preserveList, onMissing);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      substituteAny(item, env, `${path}[${index}]`, preserveList, onMissing),
    );
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      result[key] = substituteAny(val, env, childPath, preserveList, onMissing);
    }
    return result;
  }
  return value;
}

/**
 * 替换文本中的 ${VAR} 为 process.env.VAR 的值。
 * - $${VAR} 转义为字面量 ${VAR}
 * - 缺失变量抛出 MissingEnvVarError
 * - preserveList 中的变量保留 ${VAR} 字面量不替换
 *
 * @example
 * substituteEnvVars('${HOME}/config', process.env) // '/home/user/config'
 * substituteEnvVars('${UNKNOWN}', process.env) // throws MissingEnvVarError
 * substituteEnvVars('${HOME}', process.env, ['HOME']) // '${HOME}'
 */
export function substituteEnvVars(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
  preserveList?: string[],
): string {
  const set = preserveList ? new Set(preserveList) : undefined;
  return substituteString(text, env, '', set);
}

/**
 * 保留指定 env vars 不替换，其余 ${VAR} 正常替换。
 * 用于自引用场景（例如配置文件中定义要导出的环境变量本身）。
 *
 * @param text 待处理文本
 * @param preserveList 需要保留 ${VAR} 字面量的变量名列表
 * @param env 环境变量来源（默认 process.env）
 * @param onMissing 缺失变量回调（设置时不抛错，由调用方决定如何处理）
 */
export function preserveEnvVars(
  text: string,
  preserveList: string[],
  env: NodeJS.ProcessEnv = process.env,
  onMissing?: (varName: string, configPath: string) => void,
): string {
  const set = new Set(preserveList);
  return substituteString(text, env, '', set, onMissing);
}

/** 检测文本是否包含未转义的 ${VAR} 引用 */
export function containsEnvVarReference(value: string): boolean {
  if (!value.includes('$')) return false;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] !== '$') continue;
    const token = parseEnvTokenAt(value, i);
    if (token?.kind === 'escaped') {
      i = token.end;
      continue;
    }
    if (token?.kind === 'substitution') return true;
  }
  return false;
}

/**
 * 递归替换配置对象中的 ${VAR} 引用。
 * - 字符串值：替换 ${VAR}
 * - 数组：递归每个元素
 * - 对象：递归每个字段，路径格式为 'a.b[0].c'
 * - 其他原始值：原样返回
 */
export function resolveConfigEnvVars(
  obj: unknown,
  env: NodeJS.ProcessEnv = process.env,
  opts?: { onMissing?: (varName: string, configPath: string) => void; preserve?: string[] },
): unknown {
  const preserveList = opts?.preserve ? new Set(opts.preserve) : undefined;
  return substituteAny(obj, env, '', preserveList, opts?.onMissing);
}
