// OpenAI 兼容的 `tool_choice` 契约，供 Chat Completions（`/v1/chat/completions`）
// 与 Responses（`/v1/responses`）HTTP 端点共享。两者都接受 `required` 和
// 指定函数的选择，用于调用方提供的客户端工具。Agent 运行时无法强制每个上游
// provider，因此 HTTP 边界会收窄暴露的工具、引导模型，然后拒绝没有匹配结构化
// 客户端工具调用的回合。保留在此处以保持两端点一致。
// 移植自 openclaw/src/gateway/openai-tool-choice.ts（纯类型与函数，无外部依赖）。

export type ToolChoiceConstraint = { type: "required" } | { type: "function"; name: string };

export function toolChoiceConstraintPrompt(constraint: ToolChoiceConstraint): string {
  return constraint.type === "function"
    ? `You must call the ${constraint.name} tool before responding.`
    : "You must call one of the available tools before responding.";
}

// 当无约束激活，或 agent 产生了遵守约束的结构化工具调用时为 true：
// `required` 接受任意调用，指定函数需名称匹配。调用方在此返回 false 时拒绝该回合。
export function isToolChoiceConstraintSatisfied(params: {
  constraint: ToolChoiceConstraint | undefined;
  pendingToolCalls: ReadonlyArray<{ name: string }> | undefined;
}): boolean {
  const { constraint, pendingToolCalls } = params;
  if (!constraint) {
    return true;
  }
  if (!pendingToolCalls || pendingToolCalls.length === 0) {
    return false;
  }
  if (constraint.type === "required") {
    return true;
  }
  return pendingToolCalls.some((call) => call.name === constraint.name);
}

export function resolveUnsatisfiedToolChoiceMessage(constraint: ToolChoiceConstraint): string {
  return constraint.type === "function"
    ? `tool_choice required a ${constraint.name} tool call, but the agent did not produce one`
    : "tool_choice=required was not satisfied by the agent response";
}
