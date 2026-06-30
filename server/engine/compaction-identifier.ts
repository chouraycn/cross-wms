/**
 * Compaction Identifier Preservation - 标识符保留策略
 *
 * 在摘要过程中保留 UUID、ID、URL 等标识符不被破坏
 */

/** 标识符保留策略 */
export type CompactionIdentifierPolicy = 'strict' | 'custom' | 'off';

/** 标识符保留配置 */
export interface CompactionIdentifierConfig {
  policy: CompactionIdentifierPolicy;
  customInstructions?: string;
}

/** 标识符保留指令常量 */
export const IDENTIFIER_PRESERVATION_INSTRUCTIONS = [
  'Preserve all opaque identifiers exactly as written (no shortening or reconstruction),',
  'including UUIDs, hashes, IDs, hostnames, IPs, ports, URLs, and file names.',
  '',
  'Examples of identifiers to preserve:',
  '- UUIDs: 550e8400-e29b-41d4-a716-446655440000',
  '- IDs: user_12345, file_abc123',
  '- URLs: https://api.example.com/v1/users/123',
  '- IPs: 192.168.1.100, 10.0.0.1:8080',
  '- Hostnames: api.production.internal, db-primary.region-1',
  '- File paths: /workspace/src/index.ts, ./config/settings.json',
  '- Hashes: sha256:abc123..., 0xDEADBEEF',
].join('\n');

/** 摘要指令构建结果 */
export interface CompactionSummarizationInstructions {
  identifierPolicy: CompactionIdentifierPolicy;
  identifierInstructions?: string;
  fullInstructions?: string;
}

/**
 * 解析标识符保留指令
 */
export function resolveIdentifierPreservationInstructions(
  config?: CompactionIdentifierConfig,
): string | undefined {
  const policy = config?.policy ?? 'strict';

  if (policy === 'off') {
    return undefined;
  }

  if (policy === 'custom') {
    const custom = config?.customInstructions?.trim();
    return custom && custom.length > 0
      ? custom
      : IDENTIFIER_PRESERVATION_INSTRUCTIONS;
  }

  // 'strict' 默认
  return IDENTIFIER_PRESERVATION_INSTRUCTIONS;
}

/**
 * 构建压缩摘要指令
 */
export function buildCompactionSummarizationInstructions(
  customInstructions?: string,
  config?: CompactionIdentifierConfig,
): string | undefined {
  const custom = customInstructions?.trim();
  const identifierPreservation = resolveIdentifierPreservationInstructions(config);

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

/**
 * 构建合并摘要指令（用于多 chunk 合并）
 */
export const MERGE_SUMMARIES_INSTRUCTIONS = [
  'Merge these partial summaries into a single cohesive summary.',
  '',
  'MUST PRESERVE:',
  '- Active tasks and their current status (in-progress, blocked, pending)',
  '- Batch operation progress (e.g., \'5/17 items completed\')',
  '- The last thing the user requested and what was being done about it',
  '- Decisions made and their rationale',
  '- TODOs, open questions, and constraints',
  '- Any commitments or follow-ups promised',
  '',
  'PRIORITIZE recent context over older history. The agent needs to know',
  'what it was doing, not just what was discussed.',
].join('\n');

/**
 * 构建摘要结果验证指令
 */
export const SUMMARY_VALIDATION_INSTRUCTIONS = [
  'Review the summary for accuracy and completeness.',
  'Ensure all important details, decisions, and pending tasks are captured.',
  'If any critical information is missing, add it to the summary.',
].join('\n');

/**
 * 从摘要结果提取有效内容
 */
export function extractValidSummaryContent(
  summary: string,
  minLength: number = 10,
  maxLength: number = 10000,
): string {
  if (!summary || summary.trim().length < minLength) {
    return '[No summary available]';
  }

  if (summary.length > maxLength) {
    return summary.slice(0, maxLength) + '...';
  }

  return summary.trim();
}
