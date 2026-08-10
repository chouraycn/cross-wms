/**
 * StaffDeck Knowledge Routes — 挂载于 /api/staffdeck/knowledge
 *
 * 端点（16 个）：
 *   POST   /documents                       — 上传文档（创建 document + ingest job）
 *   POST   /okf/import                      — 导入 OKF 包（JSON 兼容）
 *   GET    /documents                       — 列出文档
 *   GET    /documents/:documentId           — 获取文档
 *   PUT    /documents/:documentId           — 更新文档
 *   GET    /documents/:documentId/buckets   — 列出文档的 buckets
 *   PUT    /buckets/:bucketId               — 更新 bucket
 *   GET    /buckets/:bucketId/chunks        — 列出 bucket 的 chunks
 *   PUT    /chunks/:chunkId                 — 更新 chunk
 *   GET    /jobs                            — 列出 ingest jobs
 *   GET    /jobs/:jobId                     — 获取 job
 *   POST   /jobs/:jobId/cancel              — 取消 job（stub）
 *   POST   /search                          — 搜索知识
 *   GET    /discoveries                     — 列出发现建议
 *   POST   /discoveries/:suggestionId/confirm — 确认发现
 *   POST   /discoveries/:suggestionId/reject  — 拒绝发现
 */
import { Router, type Request, type Response } from 'express';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import * as kDao from '../../dao/staff/staffKnowledgeDao.js';
import * as kbDao from '../../dao/staff/staffKnowledgeBaseDao.js';
import { logger } from '../../logger.js';

const router = Router();

function tenantOf(req: Request): string {
  return (req.query.tenant_id as string) || (req.body?.tenant_id as string) || DEFAULT_TENANT_ID;
}

// ===================== POST /documents — 上传文档（支持直接入库文本） =====================
router.post('/documents', async (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { knowledge_base_id, knowledge_base_version_id, filename, file_type, title, metadata, content } =
    req.body ?? {};
  if (!knowledge_base_id || !filename || !file_type) {
    res.status(400).json({
      code: 400,
      data: null,
      message: 'knowledge_base_id / filename / file_type 必填',
    });
    return;
  }
  // 1. 创建 document + ingest job
  const doc = kDao.createDocument({
    tenant_id: tenantId,
    knowledge_base_id,
    knowledge_base_version_id: knowledge_base_version_id ?? null,
    filename,
    file_type,
    title: title ?? null,
    status: 'processing',
    metadata: metadata ?? {},
  });
  const job = kDao.createIngestJob({
    tenant_id: tenantId,
    knowledge_base_id,
    knowledge_base_version_id: knowledge_base_version_id ?? null,
    document_id: doc.id,
    filename,
    status: 'queued',
    stage: 'queued',
    progress: 0,
  });

  // 2. 若提供了文本内容，直接走真实入库管线（切分 → 向量化 → 落库）
  const text = typeof content === 'string' ? content.trim() : '';
  if (text) {
    try {
      const result = await kDao.ingestDocumentText({
        tenant_id: tenantId,
        knowledge_base_id,
        knowledge_base_version_id: knowledge_base_version_id ?? null,
        document_id: doc.id,
        title: title ?? filename,
        text,
      });
      logger.info('[StaffK] 文档直接入库完成', { docId: doc.id, chunkCount: result.chunkCount });
    } catch (e) {
      logger.error('[StaffK] 文档入库失败:', e instanceof Error ? e.message : String(e));
      kDao.updateIngestJob(tenantId, job.id, {
        status: 'failed',
        stage: 'error',
        error: e instanceof Error ? e.message : String(e),
        finished_at: Math.floor(Date.now() / 1000),
      });
      kDao.updateDocument(tenantId, doc.id, { status: 'error', error: e instanceof Error ? e.message : String(e) });
      res.status(201).json({ code: 0, data: { doc, job: kDao.getIngestJobById(tenantId, job.id) }, message: '入库失败' });
      return;
    }
  } else {
    // 仅登记，等待后台 worker / 文件上传接入（保持向前兼容）
    logger.debug('[StaffK] document upload（无正文，仅登记）', { docId: doc.id, jobId: job.id });
  }
  res.status(201).json({ code: 0, data: { doc, job }, message: 'ok' });
});

// ===================== POST /okf/import — JSON 兼容包导入 =====================
// OKF 无正式公开 schema 规范，此处接受 JSON 兼容格式的概念包并 upsert 落库。
// 请求体：{ knowledge_base_id, knowledge_base_version_id?, concepts: [...] }
// concepts 元素字段对齐 ConceptInput（concept_id / concept_type / title / content_md ...）。
router.post('/okf/import', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { knowledge_base_id, knowledge_base_version_id, concepts } = req.body ?? {};

  if (!knowledge_base_id || typeof knowledge_base_id !== 'string') {
    res.status(400).json({
      code: 400,
      data: null,
      message: 'knowledge_base_id 必填',
    });
    return;
  }
  const kb = kbDao.getKnowledgeBaseById(tenantId, knowledge_base_id);
  if (!kb) {
    res.status(404).json({ code: 404, data: null, message: '知识库不存在' });
    return;
  }

  const rawConcepts = Array.isArray(concepts) ? concepts : [];
  const versionId =
    (knowledge_base_version_id as string | undefined) ??
    kbDao.getEffectiveKnowledgeBaseVersions(tenantId).get(knowledge_base_id)?.id ??
    'default';

  const imported: ReturnType<typeof kDao.toConceptRead>[] = [];
  let skipped = 0;
  for (const item of rawConcepts) {
    if (!item || typeof item !== 'object') {
      skipped += 1;
      continue;
    }
    const conceptId = String(item.concept_id || '').trim();
    const contentMd = String(item.content_md || '');
    if (!conceptId || !contentMd) {
      skipped += 1;
      continue;
    }
    const row = kDao.upsertConcept({
      tenant_id: tenantId,
      knowledge_base_id,
      knowledge_base_version_id: versionId,
      concept_id: conceptId,
      concept_type: String(item.concept_type || item.frontmatter?.type || 'Topic'),
      document_id: item.document_id ?? null,
      title: String(item.title || item.frontmatter?.title || conceptId),
      description: item.description ?? null,
      content_md: contentMd,
      frontmatter: item.frontmatter ?? {},
      links: item.links ?? [],
      citations: item.citations ?? [],
      source_refs: item.source_refs ?? [],
      status: item.status || 'active',
    });
    imported.push(kDao.toConceptRead(row));
  }

  res.json({
    code: 0,
    data: {
      implemented: true,
      format: 'json-compatible',
      knowledge_base_id,
      imported: imported.length,
      skipped,
      concepts: imported,
    },
    message: 'ok',
  });
});

// ===================== GET /documents — 列出文档 =====================
router.get('/documents', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const knowledgeBaseId = req.query.knowledge_base_id as string | undefined;
  const agentId = req.query.agent_id as string | undefined;

  // 传 agent_id 时按该员工挂载的知识库分支过滤，
  // 对齐原版 list_documents 的 visible_knowledge_base_versions 语义
  if (agentId) {
    const visible = kbDao.getAgentVisibleKnowledgeBaseIds(tenantId, agentId);
    if (visible.length === 0 || (knowledgeBaseId && !visible.includes(knowledgeBaseId))) {
      res.json({ code: 0, data: [], message: 'ok' });
      return;
    }
    const scope = knowledgeBaseId ? [knowledgeBaseId] : visible;
    const rows = kDao
      .listDocuments({
        tenantId,
        knowledgeBaseVersionId: req.query.knowledge_base_version_id as string | undefined,
        status: req.query.status as string | undefined,
        fileType: req.query.file_type as string | undefined,
      })
      .filter((row) => scope.includes(row.knowledge_base_id));
    res.json({ code: 0, data: rows.map(kDao.toDocumentRead), message: 'ok' });
    return;
  }

  const rows = kDao.listDocuments({
    tenantId,
    knowledgeBaseId,
    knowledgeBaseVersionId: req.query.knowledge_base_version_id as string | undefined,
    status: req.query.status as string | undefined,
    fileType: req.query.file_type as string | undefined,
  });
  res.json({ code: 0, data: rows.map(kDao.toDocumentRead), message: 'ok' });
});

// ===================== GET /documents/:documentId — 获取文档 =====================
router.get('/documents/:documentId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = kDao.getDocumentById(tenantId, req.params.documentId);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '文档不存在' });
    return;
  }
  res.json({ code: 0, data: kDao.toDocumentRead(row), message: 'ok' });
});

// ===================== PUT /documents/:documentId — 更新文档 =====================
router.put('/documents/:documentId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const patch: kDao.DocumentUpdateInput = {};
  if (typeof req.body.filename === 'string') patch.filename = req.body.filename;
  if (typeof req.body.file_type === 'string') patch.file_type = req.body.file_type;
  if (req.body.title !== undefined) patch.title = req.body.title;
  if (typeof req.body.status === 'string') patch.status = req.body.status;
  if (req.body.metadata !== undefined) patch.metadata = req.body.metadata;
  if (req.body.error !== undefined) patch.error = req.body.error;
  const row = kDao.updateDocument(tenantId, req.params.documentId, patch);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '文档不存在' });
    return;
  }
  res.json({ code: 0, data: kDao.toDocumentRead(row), message: 'ok' });
});

// ===================== GET /documents/:documentId/buckets — 列出 buckets =====================
router.get('/documents/:documentId/buckets', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const rows = kDao.listBucketsByDocument(tenantId, req.params.documentId);
  res.json({ code: 0, data: rows, message: 'ok' });
});

// ===================== PUT /buckets/:bucketId — 更新 bucket =====================
router.put('/buckets/:bucketId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const patch: kDao.BucketUpdateInput = {};
  if (typeof req.body.title === 'string') patch.title = req.body.title;
  if (typeof req.body.summary === 'string') patch.summary = req.body.summary;
  if (typeof req.body.token_estimate === 'number') patch.token_estimate = req.body.token_estimate;
  if (req.body.metadata !== undefined) patch.metadata = req.body.metadata;
  const row = kDao.updateBucket(tenantId, req.params.bucketId, patch);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'bucket 不存在' });
    return;
  }
  res.json({ code: 0, data: row, message: 'ok' });
});

// ===================== GET /buckets/:bucketId/chunks — 列出 chunks =====================
router.get('/buckets/:bucketId/chunks', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const rows = kDao.listChunksByBucket(tenantId, req.params.bucketId);
  res.json({ code: 0, data: rows, message: 'ok' });
});

// ===================== PUT /chunks/:chunkId — 更新 chunk =====================
router.put('/chunks/:chunkId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const patch: kDao.ChunkUpdateInput = {};
  if (typeof req.body.content === 'string') patch.content = req.body.content;
  if (req.body.summary !== undefined) patch.summary = req.body.summary;
  if (req.body.source_ref !== undefined) patch.source_ref = req.body.source_ref;
  if (req.body.metadata !== undefined) patch.metadata = req.body.metadata;
  const row = kDao.updateChunk(tenantId, req.params.chunkId, patch);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'chunk 不存在' });
    return;
  }
  res.json({ code: 0, data: row, message: 'ok' });
});

// ===================== GET /jobs — 列出 ingest jobs =====================
router.get('/jobs', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const rows = kDao.listIngestJobs({
    tenantId,
    knowledgeBaseId: req.query.knowledge_base_id as string | undefined,
    documentId: req.query.document_id as string | undefined,
    status: req.query.status as string | undefined,
  });
  res.json({ code: 0, data: rows, message: 'ok' });
});

// ===================== GET /jobs/:jobId — 获取 job =====================
router.get('/jobs/:jobId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = kDao.getIngestJobById(tenantId, req.params.jobId);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'job 不存在' });
    return;
  }
  res.json({ code: 0, data: row, message: 'ok' });
});

// ===================== POST /jobs/:jobId/cancel — 取消 job =====================
router.post('/jobs/:jobId/cancel', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const existing = kDao.getIngestJobById(tenantId, req.params.jobId);
  if (!existing) {
    res.status(404).json({ code: 404, data: null, message: 'job 不存在' });
    return;
  }
  // 取消 job：更新状态为 cancelled，并尝试中止运行中的 worker
  const row = kDao.updateIngestJob(tenantId, req.params.jobId, {
    status: 'cancelled',
    stage: 'cancelled',
    finished_at: Math.floor(Date.now() / 1000),
  });
  res.json({ code: 0, data: row, message: 'ok' });
});

// ===================== POST /search — 搜索 =====================
router.post('/search', async (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { query, knowledge_base_id, knowledge_base_version_id, limit } = req.body ?? {};
  if (!query || typeof query !== 'string') {
    res.status(400).json({ code: 400, data: null, message: 'query 必填' });
    return;
  }
  try {
    const hits = await kDao.searchKnowledge({
      tenant_id: tenantId,
      query,
      knowledge_base_id,
      knowledge_base_version_id,
      limit,
    });
    res.json({ code: 0, data: { hits, total: hits.length }, message: 'ok' });
  } catch (e) {
    logger.error('[StaffK] 知识搜索失败:', e instanceof Error ? e.message : String(e));
    res.status(500).json({ code: 500, data: null, message: '知识搜索失败' });
  }
});

// ===================== GET /discoveries — 列出发现建议 =====================
router.get('/discoveries', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const rows = kDao.listDiscoveries({
    tenantId,
    knowledgeBaseId: req.query.knowledge_base_id as string | undefined,
    documentId: req.query.document_id as string | undefined,
    suggestionType: req.query.suggestion_type as string | undefined,
    status: req.query.status as string | undefined,
  });
  res.json({ code: 0, data: rows, message: 'ok' });
});

// ===================== POST /discoveries/:suggestionId/confirm — 确认 =====================
router.post('/discoveries/:suggestionId/confirm', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = kDao.updateDiscoveryStatus(tenantId, req.params.suggestionId, 'confirmed');
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '发现建议不存在' });
    return;
  }
  res.json({ code: 0, data: row, message: 'ok' });
});

// ===================== POST /discoveries/:suggestionId/reject — 拒绝 =====================
router.post('/discoveries/:suggestionId/reject', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = kDao.updateDiscoveryStatus(tenantId, req.params.suggestionId, 'rejected');
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '发现建议不存在' });
    return;
  }
  res.json({ code: 0, data: row, message: 'ok' });
});

export default router;
