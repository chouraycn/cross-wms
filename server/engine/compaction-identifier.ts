/**
 * Compaction Identifier Preservation - 标识符保留策略
 *
 * 在摘要过程中保留 UUID、ID、URL 等标识符不被破坏
 *
 * v10.0: 新增 WMS 领域特定标识符保留（SKU、库位码、订单号、批次号等）
 */

/** 标识符保留策略 */
export type CompactionIdentifierPolicy = 'strict' | 'wms' | 'custom' | 'off';

/** 标识符保留配置 */
export interface CompactionIdentifierConfig {
  policy: CompactionIdentifierPolicy;
  customInstructions?: string;
}

/** 通用标识符保留指令 */
const GENERAL_IDENTIFIER_INSTRUCTIONS = [
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

/** WMS 领域特定标识符保留指令 */
const WMS_IDENTIFIER_INSTRUCTIONS = [
  'CRITICAL FOR WMS DOMAIN — Preserve ALL warehouse management identifiers exactly:',
  '',
  'SKU / Product identifiers:',
  '- SKU codes: SKU-ABC123, SKU001234, P-78901, 6901234567890 (barcode/EAN)',
  '- Product codes: PROD-2024-001, ITEM-XYZ-001, MATERIAL_NO 100001',
  '- ASIN / UPC / EAN / ISBN codes',
  '',
  'Warehouse / Location codes:',
  '- Location/bin codes: A-01-02-03, B-12-3, WH-A1-BAY-05, 货架号 A-1-1',
  '- Warehouse codes: WH001, WMS-SH, DC-BJ, 仓库编码 1001',
  '- Zone/Area codes: ZONE-A, AREA-RECEIVING, 收货区, 拣选区-01',
  '',
  'Order identifiers:',
  '- Order numbers: ORD-20240101-001, SO-12345678, 订单号 202401010001',
  '- Purchase orders: PO-98765, PO202401001, 采购单号 CG20240101',
  '- Transfer orders: TO-00123, 调拨单号 DB20240101',
  '- Return orders: RO-45678, RMA-2024-001, 退货单 RT20240101',
  '- Delivery orders: DO-12345, 出库单 CK20240101, 入库单 RK20240101',
  '',
  'Inventory / Batch identifiers:',
  '- Batch/lot numbers: LOT-ABC123, BATCH-2024-001, 批次号 240101A',
  '- Serial numbers: SN-00012345, 序列号 XYZ789',
  '- Pallet IDs: PLT-00123, 托盘号 TP-2024-0001',
  '- Container IDs: CNT-45678, 容器号 RQ-001',
  '',
  'Operation / Task identifiers:',
  '- Task numbers: TASK-2024-00123, 任务号 RW20240101001',
  '- Wave numbers: WAVE-001, 波次号 BC-20240101-01',
  '- Receipt numbers: RECV-2024-0001, 收货单 SH20240101',
  '- Count/check IDs: COUNT-001, 盘点单号 PD20240101',
  '',
  'Quantities and units:',
  '- Quantity values with units: 100pcs, 50kg, 20m³, 30箱, 1000件',
  '- Stock counts: 库存数量 1500, 可用库存 800, 在途 200',
  '',
  'DO NOT paraphrase, reformat, or simplify any of these identifiers.',
  'They must appear in the summary exactly as they appear in the source messages.',
].join('\n');

/** 标识符保留指令常量（通用 + WMS） */
export const IDENTIFIER_PRESERVATION_INSTRUCTIONS = [
  GENERAL_IDENTIFIER_INSTRUCTIONS,
  '',
  WMS_IDENTIFIER_INSTRUCTIONS,
].join('\n');

/** 仅通用标识符保留指令（不含 WMS） */
export const GENERAL_IDENTIFIER_PRESERVATION_INSTRUCTIONS = GENERAL_IDENTIFIER_INSTRUCTIONS;

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
  const policy = config?.policy ?? 'wms';

  if (policy === 'off') {
    return undefined;
  }

  if (policy === 'custom') {
    const custom = config?.customInstructions?.trim();
    return custom && custom.length > 0
      ? custom
      : IDENTIFIER_PRESERVATION_INSTRUCTIONS;
  }

  if (policy === 'strict') {
    return GENERAL_IDENTIFIER_PRESERVATION_INSTRUCTIONS;
  }

  // 'wms' 默认（通用 + WMS 领域标识符）
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
