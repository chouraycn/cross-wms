/**
 * StaffDeck Knowledge Bases Routes — 挂载于 /api/staffdeck/knowledge-bases
 *
 * 端点（14 个）：
 *   GET    /                                       — 列出知识库
 *   POST   /                                       — 创建知识库
 *   GET    /:kbId                                  — 获取知识库
 *   PUT    /:kbId                                  — 更新知识库
 *   DELETE /:kbId                                  — 删除知识库
 *   GET    /:kbId/versions                         — 列出版本
 *   GET    /:kbId/okf/concepts                     — 列出 OKF concepts
 *   GET    /:kbId/okf/concepts/:conceptId          — 获取 concept
 *   PUT    /:kbId/okf/concepts/:conceptId          — 更新 concept
 *   GET    /:kbId/okf/export                       — 导出 OKF（功能未接入）
 *   POST   /:kbId/okf/lint                         — 校验 OKF（功能未接入）
 *   POST   /:kbId/sync-from-overall                — 从 overall 同步（已接入）
 *   POST   /:kbId/promote-to-overall               — 提升为 overall（已接入）
 *   POST   /:kbId/rollback                         — 回滚到指定版本
 */
import { Router, type Request, type Response } from 'express';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import * as kbDao from '../../dao/staff/staffKnowledgeBaseDao.js';
import * as kDao from '../../dao/staff/staffKnowledgeDao.js';
import { logger } from '../../logger.js';

const router = Router();

function tenantOf(req: Request): string {
  return (req.query.tenant_id as string) || (req.body?.tenant_id as string) || DEFAULT_TENANT_ID;
}

// ===================== GET / — 列出 =====================
router.get('/', (req: Request, res: Response) => {
  const filter: kbDao.KnowledgeBaseListFilter = {
    tenantId: tenantOf(req),
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
  };
  const rows = kbDao.listKnowledgeBases(filter);
  res.json({ code: 0, data: rows.map(kbDao.toKnowledgeBaseRead), message: 'ok' });
});

// ===================== POST / — 创建 =====================
router.post('/', (req: Request, res: Response) => {
  const { name, description, status, metadata } = req.body ?? {};
  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ code: 400, data: null, message: '知识库名称不能为空' });
    return;
  }
  const tenantId = tenantOf(req);
  // 唯一性校验
  const all = kbDao.listKnowledgeBases({ tenantId });
  if (all.find((kb) => kb.name === name.trim())) {
    res.status(409).json({ code: 409, data: null, message: '知识库名称已存在' });
    return;
  }
  try {
    const row = kbDao.createKnowledgeBase({
      tenant_id: tenantId,
      name: name.trim(),
      description: description ?? null,
      status: status ?? 'active',
      metadata: metadata ?? {},
    });
    res.status(201).json({ code: 0, data: kbDao.toKnowledgeBaseRead(row), message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// ===================== GET /:kbId — 详情 =====================
router.get('/:kbId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = kbDao.getKnowledgeBaseById(tenantId, req.params.kbId);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '知识库不存在' });
    return;
  }
  res.json({ code: 0, data: kbDao.toKnowledgeBaseRead(row), message: 'ok' });
});

// ===================== PUT /:kbId — 更新 =====================
router.put('/:kbId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const patch: kbDao.KnowledgeBaseUpdateInput = {};
  if (typeof req.body.name === 'string') patch.name = req.body.name;
  if (req.body.description !== undefined) patch.description = req.body.description;
  if (typeof req.body.status === 'string') patch.status = req.body.status;
  if (req.body.metadata !== undefined) patch.metadata = req.body.metadata;
  const row = kbDao.updateKnowledgeBase(tenantId, req.params.kbId, patch);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '知识库不存在' });
    return;
  }
  res.json({ code: 0, data: kbDao.toKnowledgeBaseRead(row), message: 'ok' });
});

// ===================== DELETE /:kbId — 删除 =====================
router.delete('/:kbId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const ok = kbDao.deleteKnowledgeBase(tenantId, req.params.kbId);
  if (!ok) {
    res.status(404).json({ code: 404, data: null, message: '知识库不存在' });
    return;
  }
  res.json({ code: 0, data: null, message: 'ok' });
});

// ===================== GET /:kbId/versions — 列出版本 =====================
router.get('/:kbId/versions', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const rows = kbDao.listKnowledgeBaseVersions(tenantId, req.params.kbId);
  res.json({ code: 0, data: rows, message: 'ok' });
});

// ===================== GET /:kbId/okf/concepts — 列出 OKF concepts =====================
router.get('/:kbId/okf/concepts', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const knowledge_base_version_id = req.query.knowledge_base_version_id as string | undefined;
  const concept_type = req.query.concept_type as string | undefined;
  const status = req.query.status as string | undefined;
  const rows = kDao.listConcepts({
    tenantId,
    knowledgeBaseId: req.params.kbId,
    knowledgeBaseVersionId: knowledge_base_version_id,
    conceptType: concept_type,
    status,
  });
  res.json({ code: 0, data: rows.map(kDao.toConceptRead), message: 'ok' });
});

// ===================== GET /:kbId/okf/concepts/:conceptId — 获取 concept =====================
router.get('/:kbId/okf/concepts/:conceptId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const kbVersionId = (req.query.knowledge_base_version_id as string) || 'default';
  const row = kDao.getConceptByConceptId(tenantId, kbVersionId, req.params.conceptId);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'concept 不存在' });
    return;
  }
  res.json({ code: 0, data: kDao.toConceptRead(row), message: 'ok' });
});

// ===================== PUT /:kbId/okf/concepts/:conceptId — 更新 concept =====================
router.put('/:kbId/okf/concepts/:conceptId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const kbVersionId = (req.body.knowledge_base_version_id as string) || 'default';
  const patch: kDao.ConceptUpdateInput = {};
  if (typeof req.body.concept_type === 'string') patch.concept_type = req.body.concept_type;
  if (req.body.document_id !== undefined) patch.document_id = req.body.document_id;
  if (typeof req.body.title === 'string') patch.title = req.body.title;
  if (req.body.description !== undefined) patch.description = req.body.description;
  if (typeof req.body.content_md === 'string') patch.content_md = req.body.content_md;
  if (req.body.frontmatter !== undefined) patch.frontmatter = req.body.frontmatter;
  if (req.body.links !== undefined) patch.links = req.body.links;
  if (req.body.citations !== undefined) patch.citations = req.body.citations;
  if (req.body.source_refs !== undefined) patch.source_refs = req.body.source_refs;
  if (typeof req.body.status === 'string') patch.status = req.body.status;
  const row = kDao.updateConcept(tenantId, kbVersionId, req.params.conceptId, patch);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'concept 不存在' });
    return;
  }
  res.json({ code: 0, data: kDao.toConceptRead(row), message: 'ok' });
});

// ===================== GET /:kbId/okf/export — 功能未接入 =====================
router.get('/:kbId/okf/export', (req: Request, res: Response) => {
  res.json({
    code: 0,
    data: { implemented: false, knowledge_base_id: req.params.kbId, bundle: null },
    message: '功能未接入：OKF 导出尚未实现（无 OKF schema 规范）',
  });
});

// ===================== POST /:kbId/okf/lint — 功能未接入 =====================
router.post('/:kbId/okf/lint', (req: Request, res: Response) => {
  res.json({
    code: 0,
    data: { implemented: false, knowledge_base_id: req.params.kbId, errors: [], warnings: [] },
    message: '功能未接入：OKF 校验尚未实现（无 OKF schema 规范）',
  });
});

// ===================== POST /:kbId/sync-from-overall =====================
router.post('/:kbId/sync-from-overall', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const agentId = (req.body?.agent_id as string) || (req.query.agent_id as string) || '';
  if (!agentId) {
    res.status(400).json({ code: 400, data: null, message: 'agent_id 必填' });
    return;
  }
  try {
    const row = kbDao.syncAgentKnowledgeBranchFromOverall(tenantId, agentId, req.params.kbId);
    res.json({ code: 0, data: row, message: 'ok' });
  } catch (e) {
    res.status(404).json({ code: 404, data: null, message: (e as Error).message });
  }
});

// ===================== POST /:kbId/promote-to-overall =====================
router.post('/:kbId/promote-to-overall', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const agentId = (req.body?.agent_id as string) || (req.query.agent_id as string) || '';
  if (!agentId) {
    res.status(400).json({ code: 400, data: null, message: 'agent_id 必填' });
    return;
  }
  const row = kbDao.promoteAgentKnowledgeBranchToOverall(tenantId, agentId, req.params.kbId);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '分支不存在' });
    return;
  }
  res.json({ code: 0, data: kbDao.toKnowledgeBaseRead(row), message: 'ok' });
});

// ===================== POST /:kbId/rollback — 回滚 =====================
router.post('/:kbId/rollback', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { version } = req.body ?? {};
  if (!version || typeof version !== 'string') {
    res.status(400).json({ code: 400, data: null, message: 'version 必填' });
    return;
  }
  const row = kbDao.rollbackKnowledgeBase(tenantId, req.params.kbId, version);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '版本不存在' });
    return;
  }
  res.json({ code: 0, data: kbDao.toKnowledgeBaseRead(row), message: 'ok' });
});

export default router;
