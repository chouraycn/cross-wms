/**
 * Tags Code Mode exec/wait control tools and normalizes hook params for the
 * exec-compatible before-tool-call surface.
 *
 * 移植自 openclaw/src/agents/code-mode-control-tools.ts。
 * 降级策略：
 *   - `isPlainObject` 来自 ../utils.js → ./infra/plain-object.js（cross-wms 未实现），
 *     本地内联严格 plain-object 守卫。
 *   - `normalizeToolName` 来自 ./tool-policy.js → ./tool-policy-shared.js（cross-wms 未导出），
 *     本地内联最小实现（小写化 + bash→exec 别名）。
 *   - `AnyAgentTool` 来自 ./tools/common.js（cross-wms 已有）。
 */

import type { AnyAgentTool } from "./tools/common.js";

/** Model-visible Code Mode exec tool name. */
export const CODE_MODE_EXEC_TOOL_NAME = "exec";
/** Model-visible Code Mode wait tool name. */
export const CODE_MODE_WAIT_TOOL_NAME = "wait";
/** Hook metadata kind for Code Mode exec tools. */
export const CODE_MODE_EXEC_TOOL_KIND = "code_mode_exec";

/** Hook metadata kind type for Code Mode exec tools. */
export type CodeModeExecToolKind = typeof CODE_MODE_EXEC_TOOL_KIND;
/** Source language accepted by the Code Mode exec tool. */
export type CodeModeExecToolInputKind = "javascript" | "typescript";
/** Metadata attached to before-tool-call events for Code Mode exec. */
export type CodeModeExecHookMetadata = {
  toolKind: CodeModeExecToolKind;
  toolInputKind?: CodeModeExecToolInputKind;
};

/** 内联降级实现：严格 plain-object 守卫（排除数组与宿主对象）。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

/** 工具名别名表（仅保留 code-mode 相关）。 */
const TOOL_NAME_ALIASES: Record<string, string> = {
  bash: "exec",
  "apply-patch": "apply_patch",
};

/** 内联降级实现：将工具名归一化为策略匹配 id。 */
function normalizeToolName(name: string): string {
  const normalized = typeof name === "string" ? name.toLowerCase() : "";
  return TOOL_NAME_ALIASES[normalized] ?? normalized;
}

const codeModeControlTools = new WeakSet<AnyAgentTool>();

/** Mark a tool as owned by code mode control flow. */
export function markCodeModeControlTool<T extends AnyAgentTool>(tool: T): T {
  codeModeControlTools.add(tool);
  return tool;
}

/** Return whether a tool was marked as code-mode owned. */
export function isCodeModeControlTool(tool: AnyAgentTool): boolean {
  return codeModeControlTools.has(tool);
}

function isCodeModeExecTool(tool: AnyAgentTool): boolean {
  return isCodeModeControlTool(tool) && normalizeToolName(tool.name) === CODE_MODE_EXEC_TOOL_NAME;
}

function resolveCodeModeExecToolInputKind(params: unknown): CodeModeExecToolInputKind | undefined {
  if (!isPlainObject(params)) {
    return undefined;
  }
  const language = params.language;
  if (language === undefined || language === "javascript") {
    return "javascript";
  }
  if (language === "typescript") {
    return "typescript";
  }
  return undefined;
}

function normalizeCodeModeExecParams(params: unknown): unknown {
  if (!isPlainObject(params)) {
    return params;
  }
  const code = params.code;
  const command = params.command;
  if (typeof code === "string" && typeof command !== "string") {
    // Code-mode accepts both `code` and generic exec `command`; keep them paired
    // so downstream hooks can read either shape.
    return { ...params, command: params.code };
  }
  if (typeof command === "string" && typeof code !== "string") {
    return { ...params, code: params.command };
  }
  return params;
}

/** Build before-tool-call metadata for a marked code-mode exec tool. */
export function getCodeModeExecBeforeHookMetadata(params: {
  tool: AnyAgentTool;
  params: unknown;
}): CodeModeExecHookMetadata | undefined {
  if (!isCodeModeExecTool(params.tool)) {
    return undefined;
  }
  const toolInputKind = resolveCodeModeExecToolInputKind(params.params);
  return {
    toolKind: CODE_MODE_EXEC_TOOL_KIND,
    ...(toolInputKind && { toolInputKind }),
  };
}

/** Build before-tool-call metadata when only the tool kind is available. */
export function getCodeModeExecBeforeHookMetadataForToolKind(params: {
  toolKind: unknown;
  params: unknown;
}): CodeModeExecHookMetadata | undefined {
  if (params.toolKind !== CODE_MODE_EXEC_TOOL_KIND) {
    return undefined;
  }
  const toolInputKind = resolveCodeModeExecToolInputKind(params.params);
  return {
    toolKind: CODE_MODE_EXEC_TOOL_KIND,
    ...(toolInputKind && { toolInputKind }),
  };
}

/** Normalize before-hook params for a marked code-mode exec tool. */
export function normalizeCodeModeExecBeforeHookParams(params: {
  tool: AnyAgentTool;
  params: unknown;
}): unknown {
  if (!isCodeModeExecTool(params.tool)) {
    return params.params;
  }
  return normalizeCodeModeExecParams(params.params);
}

/** Normalize before-hook params when only the code-mode tool kind is available. */
export function normalizeCodeModeExecBeforeHookParamsForToolKind(params: {
  toolKind: unknown;
  params: unknown;
}): unknown {
  if (params.toolKind !== CODE_MODE_EXEC_TOOL_KIND) {
    return params.params;
  }
  return normalizeCodeModeExecParams(params.params);
}

/** Reconcile hook-adjusted `code` and `command` fields after code-mode normalization. */
export function reconcileCodeModeExecBeforeHookParams(params: {
  tool: AnyAgentTool;
  originalParams: unknown;
  hookParams: unknown;
  adjustedParams: unknown;
}): unknown {
  if (
    !isCodeModeExecTool(params.tool) ||
    !isPlainObject(params.originalParams) ||
    !isPlainObject(params.hookParams) ||
    !isPlainObject(params.adjustedParams)
  ) {
    return params.adjustedParams;
  }
  const hookCode = params.hookParams.code;
  const hookCommand = params.hookParams.command;
  if (typeof hookCode !== "string" || hookCode !== hookCommand) {
    return params.adjustedParams;
  }

  const adjustedCode = params.adjustedParams.code;
  const adjustedCommand = params.adjustedParams.command;
  const adjustedCodeChanged = typeof adjustedCode === "string" && adjustedCode !== hookCode;
  const adjustedCommandChanged =
    typeof adjustedCommand === "string" && adjustedCommand !== hookCode;
  if (adjustedCodeChanged === adjustedCommandChanged) {
    return params.adjustedParams;
  }

  if (adjustedCodeChanged) {
    return { ...params.adjustedParams, command: adjustedCode };
  }
  if (adjustedCommandChanged) {
    return { ...params.adjustedParams, code: adjustedCommand };
  }
  return params.adjustedParams;
}
