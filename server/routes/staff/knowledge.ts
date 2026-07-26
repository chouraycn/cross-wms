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

// ===================== POST /documents — 上传文档 =====================
router.post('/documents', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { knowledge_base_id, knowledge_base_version_id, filename, file_type, title, metadata } = req.body ?? {};
  if (!knowledge_base_id || !filename || !file_type) {
    res.status(400).json({
      code: 400,
      data: null,
      message: 'knowledge_base_id / filename / file_type 必填',
    });
    return;
  }
  // 1. 创建 document
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
  // 2. 创建 ingest job（实际 ingest 由后台 worker 执行）
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
  // TODO: 接入实际 ingest worker
  logger.debug('[StaffK] document upload', { docId: doc.id, jobId: job.id });
  res.status(201).json({ code: 0, data: job, message: 'ok' });
});

// ===================== POST /okf/import — stub =====================
router.post('/okf/import', (req: Request, res: Response) => {
  // TODO: 接入 OKF importer
  logger.debug('[StaffK] okf import stub');
  res.json({
    code: 0,
    data: { imported: 0, concepts: [] },
    message: 'stub: OKF 导入尚未接入',
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
router.post('/search', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { query, knowledge_base_id, knowledge_base_version_id, limit } = req.body ?? {};
  if (!query || typeof query !== 'string') {
    res.status(400).json({ code: 400, data: null, message: 'query 必填' });
    return;
  }
  const hits = kDao.searchKnowledge({
    tenant_id: tenantId,
    query,
    knowledge_base_id,
    knowledge_base_version_id,
    limit,
  });
  res.json({ code: 0, data: { hits, total: hits.length }, message: 'ok' });
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
