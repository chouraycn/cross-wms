/**
 * StaffDeck Knowledge Routes — 挂载于 /api/staffdeck/knowledge
 *
 * 端点（16 个）：
 *   POST   /documents                       — 上传文档（创建 document + ingest job）
 *   POST   /okf/import                      — 导入 OKF 包（stub）
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

// ===================== POST /okf/import — 功能未接入 =====================
router.post('/okf/import', (req: Request, res: Response) => {
  res.json({
    code: 0,
    data: { implemented: false, imported: 0, concepts: [] },
    message: '功能未接入：OKF 包导入尚未实现（无 OKF schema 规范），请使用「新增文档（文本入库）」入库',
  });
});

// ===================== GET /documents — 列出文档 =====================
router.get('/documents', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const rows = kDao.listDocuments({
    tenantId,
    knowledgeBaseId: req.query.knowledge_base_id as string | undefined,
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
  // TODO: 接入实际 job worker 的取消逻辑
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
