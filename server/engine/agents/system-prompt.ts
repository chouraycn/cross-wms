/**
 * 移植自 openclaw/src/agents/system-prompt.ts
 *
 * Agent system prompt assembly helpers.
 * Cross-wms simplified: basic prompt building without deep plugin/context-engine integration.
 */

/** Builds bootstrap system context string. */
export function buildAgentBootstrapSystemContext(params: {
  agentId?: string;
  runtime?: string;
  cwd?: string;
  modelId?: string;
}): string {
  const lines: string[] = [];
  if (params.runtime) lines.push(`Runtime: ${params.runtime}`);
  if (params.agentId) lines.push(`Agent: ${params.agentId}`);
  if (params.cwd) lines.push(`Working directory: ${params.cwd}`);
  if (params.modelId) lines.push(`Model: ${params.modelId}`);
  return lines.join("\n");
}

/** Builds bootstrap system prompt sections. */
export function buildAgentBootstrapSystemPromptSections(params: {
  agentId?: string;
  runtime?: string;
  cwd?: string;
  modelId?: string;
  identityLine?: string;
}): Array<{ role: string; content: string }> {
  const sections: Array<{ role: string; content: string }> = [];
  const context = buildAgentBootstrapSystemContext(params);
  if (context) {
    sections.push({ role: "context", content: context });
  }
  if (params.identityLine) {
    sections.push({ role: "identity", content: params.identityLine });
  }
  return sections;
}

/** Builds a model identity prompt line. */
export function buildModelIdentityPromptLine(params: {
  modelId?: string;
  provider?: string;
}): string {
  if (params.modelId && params.provider) {
    return `You are ${params.modelId} via ${params.provider}.`;
  }
  if (params.modelId) {
    return `You are ${params.modelId}.`;
  }
  return "You are a helpful AI assistant.";
}

/** Appends model identity to an existing system prompt. */
export function appendModelIdentitySystemPrompt(params: {
  systemPrompt: string;
  modelId?: string;
  provider?: string;
}): string {
  const identityLine = buildModelIdentityPromptLine(params);
  if (!params.systemPrompt) return identityLine;
  return `${params.systemPrompt}\n\n${identityLine}`;
}

/** Builds the full agent system prompt. */
export function buildAgentSystemPrompt(params: {
  agentId?: string;
  runtime?: string;
  cwd?: string;
  modelId?: string;
  customInstructions?: string;
}): string {
  const sections = buildAgentBootstrapSystemPromptSections(params);
  let prompt = sections.map((s) => s.content).join("\n\n");
  if (params.customInstructions) {
    prompt = prompt ? `${prompt}\n\n${params.customInstructions}` : params.customInstructions;
  }
  return prompt;
}

/** Builds the runtime identification line. */
export function buildRuntimeLine(params: {
  runtime?: string;
  version?: string;
}): string {
  const runtime = params.runtime ?? "cross-wms";
  const version = params.version ? ` v${params.version}` : "";
  return `Running in ${runtime}${version}.`;
}
