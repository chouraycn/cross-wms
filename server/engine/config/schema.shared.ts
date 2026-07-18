// 移植自 openclaw/src/config/schema.shared.ts
// 为生成的配置元数据提供共享的 JSON schema 助手。

type JsonSchemaObject = {
  type?: string | string[];
  properties?: Record<string, JsonSchemaObject>;
  additionalProperties?: JsonSchemaObject | boolean;
  items?: JsonSchemaObject | JsonSchemaObject[];
  anyOf?: JsonSchemaObject[];
  allOf?: JsonSchemaObject[];
  oneOf?: JsonSchemaObject[];
};

/** 在调用方修改插件或基础 schema 片段之前深拷贝 schema 载荷。 */
export function cloneSchema<T>(value: T): T {
  return structuredClone(value);
}

/** 将未知的 JSON-schema 片段收窄为非数组对象。 */
export function asSchemaObject(value: unknown): object | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value;
}

/** 返回 schema 节点是否通过 properties、items 或 unions 暴露嵌套字段。 */
export function schemaHasChildren(schema: JsonSchemaObject): boolean {
  if (schema.properties && Object.keys(schema.properties).length > 0) {
    return true;
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    return true;
  }
  if (Array.isArray(schema.items)) {
    return schema.items.some((entry) => typeof entry === 'object' && entry !== null);
  }
  for (const branch of [schema.oneOf, schema.anyOf, schema.allOf]) {
    if (branch?.some((entry) => entry && typeof entry === 'object' && schemaHasChildren(entry))) {
      return true;
    }
  }
  return Boolean(schema.items && typeof schema.items === 'object');
}

/** 找到匹配具体配置路径的最具体的通配符 UI 提示。 */
export function findWildcardHintMatch<T>(params: {
  uiHints: Record<string, T>;
  path: string;
  splitPath: (path: string) => string[];
}): { path: string; hint: T } | null {
  const targetParts = params.splitPath(params.path);
  let bestMatch:
    | {
        path: string;
        hint: T;
        wildcardCount: number;
      }
    | undefined;

  for (const [hintPath, hint] of Object.entries(params.uiHints)) {
    const hintParts = params.splitPath(hintPath);
    if (hintParts.length !== targetParts.length) {
      continue;
    }

    let wildcardCount = 0;
    let matches = true;
    for (let index = 0; index < hintParts.length; index += 1) {
      const hintPart = hintParts[index];
      const targetPart = targetParts[index];
      if (hintPart === targetPart) {
        continue;
      }
      if (hintPart === '*') {
        wildcardCount += 1;
        continue;
      }
      matches = false;
      break;
    }

    if (!matches) {
      continue;
    }
    // 通配符越少意味着提示越接近具体路径，应当胜出。
    if (!bestMatch || wildcardCount < bestMatch.wildcardCount) {
      bestMatch = { path: hintPath, hint, wildcardCount };
    }
  }

  return bestMatch ? { path: bestMatch.path, hint: bestMatch.hint } : null;
}
