/**
 * 移植自 openclaw/src/agents/tool-schema-projection.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { projectRuntimeToolInputSchema } from "./tool-schema-json-projection.js";
export type { RuntimeToolInputSchemaJson, RuntimeToolInputSchemaProjection } from "./tool-schema-json-projection.js";
export type RuntimeToolSchemaDiagnostic = unknown;
export function inspectRuntimeToolInputSchemas(..._args: unknown[]): unknown {
  throw new Error("inspectRuntimeToolInputSchemas not implemented (openclaw stub)");
}
export function filterRuntimeCompatibleTools(..._args: unknown[]): unknown {
  throw new Error("filterRuntimeCompatibleTools not implemented (openclaw stub)");
}
export function filterProviderNormalizableTools(..._args: unknown[]): unknown {
  throw new Error("filterProviderNormalizableTools not implemented (openclaw stub)");
}
