/**
 * @vitest-environment node
 *
 * Staff 知识库「真实 RAG」测试：
 * 1. ingestDocumentText 把文本切分、向量化、写入 chunks（带 embedding 列）
 * 2. searchKnowledge 走向量语义检索，相关 chunk 排在前面且 score 更高
 * 3. 向量不可用时（embedText 抛错）回退到 LIKE，仍能命中
 *
 * 策略：vi.mock 把 db.js 替换为内存 SQLite，并调用 initStaffTables 建表；
 * 把 onnxEmbedding 替换为确定性的「内容敏感」向量（字符哈希归一化）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

// ===================== Mock Setup（必须在导入 DAO 之前） =====================

let mockDb: Database.Database;

vi.mock('../../../db.js', () => ({
  initDb: vi.fn(() => mockDb),
}));

// 确定性「内容敏感」向量：相同文本 → 相同向量；共享字符越多 → 余弦越高
function mockEmbed(text: string): Float32Array {
  const dim = 384;
  const v = new Array(dim).fill(0);
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    v[code % dim] += 1;
    v[(code * 31) % dim] += 0.5;
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return Float32Array.from(v.map((x) => x / norm));
}

vi.mock('../../../engine/onnxEmbedding.js', () => ({
  embedBatch: vi.fn(async (texts: string[]) => texts.map((t) => mockEmbed(t))),
  embedText: vi.fn(async (text: string) => mockEmbed(text)),
  ONNX_EMBEDDING_DIMENSIONS: 384,
}));

const { initStaffTables } = await import('../../../db-staff.js');
const kDao = await import('../staffKnowledgeDao.js');

const TENANT = 'default';
const KB_ID = 'kb-test-1';

// 长段落（每个主题约 520 字，确保在 600 字符上限下各自成块，且以换行自然断句）
const REFUND_SECTION =
  '退款政策说明：用户在完成购买之后七天之内可以发起退款申请，客服会在收到申请之后进行人工审核，审核通过之后款项将原路退回至用户的付款账户之中。'.repeat(
    7,
  );
const INVENTORY_SECTION =
  '库存管理规范：每日闭店之前需要进行全仓盘点，将实际数量录入系统，当库存低于安全库存阈值时自动触发补货流程并通知采购负责人。'.repeat(
    7,
  );
const MEMBER_SECTION =
  '会员等级体系：平台将会员分为普通会员、银卡会员与金卡会员三个等级，其中金卡会员享受全场九折优惠以及专属客服通道等权益。'.repeat(
    7,
  );
const SEEDED_TEXT = [REFUND_SECTION, INVENTORY_SECTION, MEMBER_SECTION].join('\n');

beforeEach(() => {
  mockDb = new Database(':memory:');
  initStaffTables(mockDb);
});

describe('真实 RAG：入库管线', () => {
  it('ingestDocumentText 切分并写入带 embedding 的 chunks，且 doc/job 状态翻转', async () => {
    const doc = kDao.createDocument({
      tenant_id: TENANT,
      knowledge_base_id: KB_ID,
      filename: 'faq.txt',
      file_type: 'text',
      title: 'FAQ',
      status: 'processing',
    });
    kDao.createIngestJob({
      tenant_id: TENANT,
      knowledge_base_id: KB_ID,
      document_id: doc.id,
      filename: 'faq.txt',
    });

    const result = await kDao.ingestDocumentText({
      tenant_id: TENANT,
      knowledge_base_id: KB_ID,
      document_id: doc.id,
      title: 'FAQ',
      text: SEEDED_TEXT,
    });

    expect(result.chunkCount).toBeGreaterThanOrEqual(3);
    const chunks = kDao.listChunksByBucket(TENANT, result.bucketId);
    expect(chunks.length).toBe(result.chunkCount);
    // 每个 chunk 都带上了 embedding（JSON 数组，长度 384）
    for (const c of chunks) {
      expect(c.embedding).toBeTruthy();
      const vec = JSON.parse(c.embedding as string) as number[];
      expect(vec.length).toBe(384);
    }
    // doc 状态翻转
    const updatedDoc = kDao.getDocumentById(TENANT, doc.id);
    expect(updatedDoc?.status).toBe('indexed');
    // job 状态翻转
    const jobs = kDao.listIngestJobs({ tenantId: TENANT, documentId: doc.id });
    expect(jobs[0]?.status).toBe('completed');
  });
});

describe('真实 RAG：向量语义检索', () => {
  async function seed() {
    const doc = kDao.createDocument({
      tenant_id: TENANT,
      knowledge_base_id: KB_ID,
      filename: 'kb.txt',
      file_type: 'text',
      title: 'KB',
      status: 'processing',
    });
    await kDao.ingestDocumentText({
      tenant_id: TENANT,
      knowledge_base_id: KB_ID,
      document_id: doc.id,
      title: 'KB',
      text: SEEDED_TEXT,
    });
  }

  it('向量检索把语义相关 chunk 排在前面（且非 LIKE 可解释）', async () => {
    await seed();
    // 查询串本身不在任何 chunk 正文中作为子串出现 → LIKE 必然 0 命中，
    // 能命中即证明走的是向量语义检索。
    const query = '怎么申请退款';
    const hits = await kDao.searchKnowledge({
      tenant_id: TENANT,
      knowledge_base_id: KB_ID,
      query,
      limit: 10,
    });
    expect(hits.length).toBeGreaterThan(0);
    const exactSubstring = hits.some((h) => h.chunk.content.includes(query));
    expect(exactSubstring).toBe(false);
    // 最相关命中落在「退款」主题块上
    expect(hits[0].chunk.content).toContain('退款');
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it('向量不可用时回退 LIKE，仍能命中关键词', async () => {
    await seed();
    // 让 embedText 抛错 → 查询向量为 null → 走 LIKE 兜底
    const onnx = await import('../../../engine/onnxEmbedding.js');
    vi.mocked(onnx.embedText).mockRejectedValueOnce(new Error('onnx unavailable'));
    const hits = await kDao.searchKnowledge({
      tenant_id: TENANT,
      knowledge_base_id: KB_ID,
      query: '会员',
      limit: 10,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.chunk.content.includes('会员'))).toBe(true);
  });
});
