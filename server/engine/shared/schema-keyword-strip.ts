// 递归移除目标 provider/tool 表面不支持的 schema 关键字
export function stripUnsupportedSchemaKeywords(
  schema: unknown,
  unsupportedKeywords: ReadonlySet<string>,
): unknown {
  if (!schema || typeof schema !== "object") {
    return schema;
  }
  if (Array.isArray(schema)) {
    return schema.map((entry) => stripUnsupportedSchemaKeywords(entry, unsupportedKeywords));
  }
  const obj = schema as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (unsupportedKeywords.has(key)) {
      continue;
    }
    // schema 容器在不同形状下持有嵌套 schema，递归每个已知容器同时保留无关元数据字段
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      cleaned[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
          childKey,
          stripUnsupportedSchemaKeywords(childValue, unsupportedKeywords),
        ]),
      );
      continue;
    }
    if (key === "items" && value && typeof value === "object") {
      cleaned[key] = Array.isArray(value)
        ? value.map((entry) => stripUnsupportedSchemaKeywords(entry, unsupportedKeywords))
        : stripUnsupportedSchemaKeywords(value, unsupportedKeywords);
      continue;
    }
    if ((key === "anyOf" || key === "oneOf" || key === "allOf") && Array.isArray(value)) {
      cleaned[key] = value.map((entry) =>
        stripUnsupportedSchemaKeywords(entry, unsupportedKeywords),
      );
      continue;
    }
    cleaned[key] = value;
  }
  return cleaned;
}
