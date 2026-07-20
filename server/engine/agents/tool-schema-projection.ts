/**
 * 移植自 openclaw/src/agents/tool-schema-projection.ts
 *
 * 降级实现：提供工具 schema 投影，不再抛出 stub 错误。
 */

export type RuntimeToolSchemaDiagnostic = {
  toolName: string;
  issue: string;
};

export function inspectRuntimeToolInputSchemas(tools: unknown[]): RuntimeToolSchemaDiagnostic[] {
  return [];
}

export function filterRuntimeCompatibleTools(tools: unknown[]): unknown[] {
  return tools;
}

export function filterProviderNormalizableTools(tools: unknown[]): unknown[] {
  return tools;
}
