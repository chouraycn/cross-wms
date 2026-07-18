/**
 * OpenAI tool projection — snapshots tool descriptors before payload construction.
 *
 * 移植自 openclaw/src/agents/openai-tool-projection.ts。
 * 注意：原 openclaw 实现依赖 `openai` 包的 SDK 类型（ResponseCreateParamsStreaming、
 * ChatCompletionCreateParamsStreaming 中的 tool_choice）。cross-wms 未直接依赖 `openai` 包，
 * 本地降级实现：以宽松的本地类型替代 SDK 类型，行为契约与 openclaw 一致。
 */
import { projectRuntimeToolInputSchema } from "./tool-schema-json-projection.js";

type OpenAIToolDescriptor = {
  readonly name?: unknown;
  readonly description?: unknown;
  readonly parameters: unknown;
};

type OpenAIProjectedTool = {
  readonly toolIndex: number;
  readonly name: string;
  readonly description?: string;
  readonly parameters: Record<string, unknown>;
};

type OpenAIToolProjectionDiagnostic = {
  readonly toolIndex: number;
  readonly toolName?: string;
  readonly violations: readonly string[];
};

export type OpenAIToolProjection = {
  readonly inputToolCount: number;
  readonly tools: readonly OpenAIProjectedTool[];
  readonly diagnostics: readonly OpenAIToolProjectionDiagnostic[];
};

// 本地降级类型：替代 `openai` SDK 的 ResponseCreateParamsStreaming["tool_choice"]。
// 仅保留 projectOpenAITools/reconcileOpenAIResponsesToolChoice 实际访问的字段。
type OpenAIResponsesToolChoiceLiteral = "auto" | "required" | "none";
type OpenAIResponsesFunctionToolChoice = { type: "function"; name: string };
type OpenAIResponsesAllowedToolChoiceTool = { type: "function"; name: string } | Record<string, unknown>;
type OpenAIResponsesAllowedToolChoice = {
  type: "allowed_tools";
  mode: "auto" | "required";
  tools: OpenAIResponsesAllowedToolChoiceTool[];
};
type OpenAIResponsesToolChoice =
  | OpenAIResponsesToolChoiceLiteral
  | OpenAIResponsesFunctionToolChoice
  | OpenAIResponsesAllowedToolChoice
  | Record<string, unknown>;

// 本地降级类型：替代 `openai` SDK 的 ChatCompletionCreateParamsStreaming["tool_choice"]。
type OpenAICompletionsToolChoiceLiteral = "auto" | "required" | "none";
type OpenAICompletionsFunctionToolChoice = {
  type: "function";
  function: { name: string };
};
type OpenAICompletionsAllowedToolChoice = {
  type: "allowed_tools";
  allowed_tools: {
    mode: "auto" | "required";
    tools: Array<{ type: "function"; function: { name: string } }>;
  };
};
type OpenAICompletionsToolChoice =
  | OpenAICompletionsToolChoiceLiteral
  | OpenAICompletionsFunctionToolChoice
  | OpenAICompletionsAllowedToolChoice
  | { type: "custom" }
  | Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unreadableToolDiagnostic(toolIndex: number): OpenAIToolProjectionDiagnostic {
  return {
    toolIndex,
    violations: [`tool[${toolIndex}] is unreadable`],
  };
}

/** Snapshots direct/custom tool descriptors before OpenAI payload construction. */
export function projectOpenAITools(tools: readonly OpenAIToolDescriptor[]): OpenAIToolProjection {
  let inputToolCount: number;
  try {
    inputToolCount = tools.length;
  } catch {
    return {
      inputToolCount: 0,
      tools: [],
      diagnostics: [unreadableToolDiagnostic(0)],
    };
  }

  const projectedTools: OpenAIProjectedTool[] = [];
  const diagnostics: OpenAIToolProjectionDiagnostic[] = [];
  for (let toolIndex = 0; toolIndex < inputToolCount; toolIndex += 1) {
    let tool: OpenAIToolDescriptor;
    try {
      tool = tools[toolIndex];
    } catch {
      diagnostics.push(unreadableToolDiagnostic(toolIndex));
      continue;
    }

    let name: unknown;
    try {
      name = tool.name;
    } catch {
      diagnostics.push({
        toolIndex,
        violations: [`tool[${toolIndex}].name is unreadable`],
      });
      continue;
    }
    if (typeof name !== "string" || !name) {
      diagnostics.push({
        toolIndex,
        violations: [`tool[${toolIndex}].name is empty`],
      });
      continue;
    }

    let parameters: unknown;
    try {
      parameters = tool.parameters;
    } catch {
      diagnostics.push({
        toolIndex,
        toolName: name,
        violations: [`${name}.parameters is unreadable`],
      });
      continue;
    }
    const schemaProjection = projectRuntimeToolInputSchema(parameters ?? {}, `${name}.parameters`);
    if (!isRecord(schemaProjection.schema) || schemaProjection.violations.length > 0) {
      diagnostics.push({
        toolIndex,
        toolName: name,
        violations:
          schemaProjection.violations.length > 0
            ? schemaProjection.violations
            : [`${name}.parameters must be a JSON object schema`],
      });
      continue;
    }

    let descriptionValue: unknown;
    try {
      descriptionValue = tool.description;
    } catch {
      // Description is optional; preserve the usable function schema.
    }
    const description = typeof descriptionValue === "string" ? descriptionValue : undefined;
    projectedTools.push({
      toolIndex,
      name,
      ...(description !== undefined ? { description } : {}),
      parameters: schemaProjection.schema,
    });
  }

  return {
    inputToolCount,
    tools: projectedTools,
    diagnostics,
  };
}

function requireProjectedFunction(
  name: string,
  projection: OpenAIToolProjection,
  choiceLabel: string,
): void {
  if (!projection.tools.some((tool) => tool.name === name)) {
    throw new Error(`${choiceLabel} requested unavailable tool "${name}" after schema conversion`);
  }
}

/** Keeps Responses tool choices aligned with surviving function schemas. */
export function reconcileOpenAIResponsesToolChoice(
  choice: OpenAIResponsesToolChoice,
  projection: OpenAIToolProjection,
): OpenAIResponsesToolChoice | undefined {
  if (choice === "auto") {
    return projection.tools.length > 0 ? choice : undefined;
  }
  if (choice === "required") {
    if (projection.tools.length === 0) {
      throw new Error(
        "OpenAI Responses tool_choice requires a tool, but no tools survived schema conversion",
      );
    }
    return choice;
  }
  if (choice === "none" || !isRecord(choice)) {
    return choice;
  }
  const choiceType = choice.type;
  if (choiceType === "function") {
    const functionName = (choice as OpenAIResponsesFunctionToolChoice).name;
    if (typeof functionName !== "string") {
      return choice;
    }
    requireProjectedFunction(functionName, projection, "OpenAI Responses tool_choice");
    return { type: "function", name: functionName };
  }
  if (choiceType !== "allowed_tools") {
    return choice;
  }

  const allowedChoice = choice as OpenAIResponsesAllowedToolChoice;
  const mode = allowedChoice.mode;
  const tools = allowedChoice.tools;
  if ((mode !== "auto" && mode !== "required") || !Array.isArray(tools)) {
    return choice;
  }
  const normalizedAllowedTools: OpenAIResponsesAllowedToolChoiceTool[] = [];
  for (const tool of tools) {
    if (!isRecord(tool) || tool.type !== "function") {
      normalizedAllowedTools.push(tool);
      continue;
    }
    const functionName = (tool as { name?: unknown }).name;
    if (
      typeof functionName === "string" &&
      projection.tools.some((projectedTool) => projectedTool.name === functionName)
    ) {
      normalizedAllowedTools.push({ type: "function", name: functionName });
    }
  }
  if (normalizedAllowedTools.length === 0) {
    if (mode === "auto") {
      return "none";
    }
    throw new Error(
      "OpenAI Responses tool_choice requires a tool, but no allowed tools survived schema conversion",
    );
  }
  return {
    type: "allowed_tools",
    mode,
    tools: normalizedAllowedTools,
  };
}

/** Keeps Chat Completions tool choices aligned with surviving function schemas. */
export function reconcileOpenAICompletionsToolChoice(
  choice: OpenAICompletionsToolChoice,
  projection: OpenAIToolProjection,
): OpenAICompletionsToolChoice | undefined {
  if (choice === "auto") {
    return projection.tools.length > 0 ? choice : undefined;
  }
  if (choice === "required") {
    if (projection.tools.length === 0) {
      throw new Error(
        "OpenAI Chat Completions tool_choice requires a tool, but no tools survived schema conversion",
      );
    }
    return choice;
  }
  if (choice === "none" || !isRecord(choice)) {
    return choice;
  }
  const choiceType = choice.type;
  if (choiceType === "custom") {
    throw new Error(
      "OpenAI Chat Completions custom tool_choice is unsupported because this adapter emits function tools only",
    );
  }
  if (choiceType === "function") {
    const functionChoice = (choice as OpenAICompletionsFunctionToolChoice).function;
    if (!isRecord(functionChoice)) {
      return choice;
    }
    const functionName = functionChoice.name;
    if (typeof functionName !== "string") {
      return choice;
    }
    requireProjectedFunction(functionName, projection, "OpenAI Chat Completions tool_choice");
    return { type: "function", function: { name: functionName } };
  }
  if (choiceType !== "allowed_tools") {
    return choice;
  }

  const allowedChoice = choice as OpenAICompletionsAllowedToolChoice;
  const allowedConfig = allowedChoice.allowed_tools;
  if (!isRecord(allowedConfig)) {
    return choice;
  }
  const mode = allowedConfig.mode;
  const tools = allowedConfig.tools;
  if ((mode !== "auto" && mode !== "required") || !Array.isArray(tools)) {
    return choice;
  }
  const normalizedAllowedTools: OpenAICompletionsAllowedToolChoice["allowed_tools"]["tools"] = [];
  for (const tool of tools) {
    if (!isRecord(tool) || tool.type !== "function") {
      continue;
    }
    const functionChoice = tool.function;
    const functionName = isRecord(functionChoice) ? functionChoice.name : undefined;
    if (
      typeof functionName === "string" &&
      projection.tools.some((projectedTool) => projectedTool.name === functionName)
    ) {
      normalizedAllowedTools.push({
        type: "function",
        function: { name: functionName },
      });
    }
  }
  if (normalizedAllowedTools.length === 0) {
    if (mode === "auto") {
      return "none";
    }
    throw new Error(
      "OpenAI Chat Completions tool_choice requires a tool, but no allowed tools survived schema conversion",
    );
  }
  return {
    type: "allowed_tools",
    allowed_tools: {
      mode,
      tools: normalizedAllowedTools,
    },
  };
}
