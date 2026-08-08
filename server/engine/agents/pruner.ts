/**
 * Ported from openclaw/src/agents/agent-hooks/context-pruning/pruner.ts
 *
 * Context-pruning planner that trims old assistant/tool content under token pressure.
 * Cross-wms degradation: returns messages unchanged without token estimation.
 */

/** Returns a pruned message array when configured thresholds are exceeded, otherwise original. */
export function pruneContextMessages(params: {
  messages: any[];
  settings: Record<string, any>;
  ctx: Record<string, any>;
  isToolPrunable?: (toolName: string) => boolean;
  contextWindowTokensOverride?: number;
  dropThinkingBlocksForEstimate?: boolean;
}): any[] {
  // Cross-wms does not have token estimation or context window resolution.
  // Return messages unchanged.
  return params.messages;
}
