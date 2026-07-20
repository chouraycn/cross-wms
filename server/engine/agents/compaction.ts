/**
 * 移植自 openclaw/src/agents/compaction.ts
 *
 * Summarization and fallback helpers for transcript compaction.
 * cross-wms 简化实现：提供基本的 compaction instructions 和 context window 解析。
 */

const IDENTIFIER_PRESERVATION_INSTRUCTIONS =
  "Preserve all opaque identifiers exactly as written (no shortening or reconstruction), " +
  "including UUIDs, hashes, IDs, hostnames, IPs, ports, URLs, and file names.";

const DEFAULT_CONTEXT_TOKENS = 128_000;

export type CompactionSummarizationInstructions = {
  identifierPolicy?: "off" | "strict" | "custom";
  identifierInstructions?: string;
};

function resolveIdentifierPreservationInstructions(
  instructions?: CompactionSummarizationInstructions,
): string | undefined {
  const policy = instructions?.identifierPolicy ?? "strict";
  if (policy === "off") {
    return undefined;
  }
  if (policy === "custom") {
    const custom = instructions?.identifierInstructions?.trim();
    return custom && custom.length > 0 ? custom : IDENTIFIER_PRESERVATION_INSTRUCTIONS;
  }
  return IDENTIFIER_PRESERVATION_INSTRUCTIONS;
}

/** Combines identifier-preservation and caller-provided compaction instructions. */
export function buildCompactionSummarizationInstructions(
  customInstructions?: string,
  instructions?: CompactionSummarizationInstructions,
): string | undefined {
  const custom = customInstructions?.trim();
  const identifierPreservation = resolveIdentifierPreservationInstructions(instructions);
  if (!identifierPreservation && !custom) {
    return undefined;
  }
  if (!custom) {
    return identifierPreservation;
  }
  if (!identifierPreservation) {
    return `Additional focus:\n${custom}`;
  }
  return `${identifierPreservation}\n\nAdditional focus:\n${custom}`;
}

/** Summarize with progressive fallback — simplified in cross-wms. */
export async function summarizeWithFallback(params: {
  messages: unknown[];
  model?: unknown;
  apiKey?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  reserveTokens?: number;
  maxChunkTokens?: number;
  contextWindow?: number;
  customInstructions?: string;
  summarizationInstructions?: CompactionSummarizationInstructions;
  previousSummary?: string;
}): Promise<string> {
  if (params.messages.length === 0) {
    return params.previousSummary ?? "No prior history.";
  }
  return `Context contained ${params.messages.length} messages. Summary unavailable in cross-wms.`;
}

/** Summarizes history in multiple stages — simplified in cross-wms. */
export async function summarizeInStages(params: {
  messages: unknown[];
  model?: unknown;
  apiKey?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  reserveTokens?: number;
  maxChunkTokens?: number;
  contextWindow?: number;
  customInstructions?: string;
  summarizationInstructions?: CompactionSummarizationInstructions;
  previousSummary?: string;
  parts?: number;
  minMessagesForSplit?: number;
}): Promise<string> {
  return summarizeWithFallback(params);
}

/** Resolves a positive context-window token count from model metadata. */
export function resolveContextWindowTokens(model?: unknown): number {
  const m = model as Record<string, unknown> | undefined;
  const effective = m?.contextTokens ?? m?.contextWindow;
  return Math.max(1, Math.floor((typeof effective === "number" ? effective : DEFAULT_CONTEXT_TOKENS)));
}
