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
 *   GET    /:kbId/okf/export                       — 导出 OKF（JSON 兼容）
 *   POST   /:kbId/okf/lint                         — 校验 OKF（JSON 兼容）
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

/**
 * 单条知识库序列化：补齐 document_count / bucket_count / chunk_count 统计，
 * 以及 version / branch_sync_state / branch_base_version / branch_head_version。
 */
function readWithStats(
  tenantId: string,
  row: Parameters<typeof kbDao.toKnowledgeBaseRead>[0],
  agentId?: string,
) {
  const stats = kbDao.getKnowledgeBaseStats(tenantId).get(row.id);
  const versionRow = kbDao.getEffectiveKnowledgeBaseVersions(tenantId, agentId).get(row.id);
  const branchMeta = agentId
    ? kbDao.getAgentKnowledgeBranchMeta(tenantId, agentId).get(row.id)
    : undefined;
  return kbDao.toKnowledgeBaseRead(row, stats, { versionRow, branchMeta });
}

// ===================== GET / — 列出 =====================
router.get('/', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const filter: kbDao.KnowledgeBaseListFilter = {
    tenantId,
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
  };
  let rows = kbDao.listKnowledgeBases(filter);

  // 传 agent_id 时只返回该员工挂载的知识库分支（对齐原版员工隔离语义）
  const agentId = req.query.agent_id as string | undefined;
  if (agentId) {
    const visible = new Set(kbDao.getAgentVisibleKnowledgeBaseIds(tenantId, agentId));
    rows = rows.filter((row) => visible.has(row.id));
  }

  // 批量聚合文档/目录/引用数量，前端依赖这三个字段展示知识资产规模
  const stats = kbDao.getKnowledgeBaseStats(tenantId);
  // 版本与分支元信息一次性解析，供 version / branch_* 字段使用
  const versions = kbDao.getEffectiveKnowledgeBaseVersions(tenantId, agentId);
  const branches = agentId ? kbDao.getAgentKnowledgeBranchMeta(tenantId, agentId) : undefined;
  res.json({
    code: 0,
    data: rows.map((row) =>
      kbDao.toKnowledgeBaseRead(row, stats.get(row.id), {
        versionRow: versions.get(row.id),
        branchMeta: branches?.get(row.id),
      }),
    ),
    message: 'ok',
  });
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
    res.status(201).json({ code: 0, data: readWithStats(tenantId, row), message: 'ok' });
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
  res.json({ code: 0, data: readWithStats(tenantId, row), message: 'ok' });
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
  res.json({ code: 0, data: readWithStats(tenantId, row), message: 'ok' });
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

// ===================== GET /:kbId/okf/export — JSON 兼容导出 =====================
// OKF 无正式公开 schema 规范，此处以 JSON 兼容格式导出知识库全部概念与文档，
// 便于跨实例迁移与备份。响应中 format 标注当前处理格式。
router.get('/:kbId/okf/export', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const kbId = req.params.kbId;
  const kb = kbDao.getKnowledgeBaseById(tenantId, kbId);
  if (!kb) {
    res.status(404).json({ code: 404, data: null, message: '知识库不存在' });
    return;
  }
  const agentId = req.query.agent_id as string | undefined;
  const explicitVersion = req.query.knowledge_base_version_id as string | undefined;
  const versionRow = kbDao.getEffectiveKnowledgeBaseVersions(tenantId, agentId).get(kbId);
  const versionId = explicitVersion ?? versionRow?.id ?? 'default';

  const concepts = kDao.listConcepts({
    tenantId,
    knowledgeBaseId: kbId,
    knowledgeBaseVersionId: versionId,
    status: 'active',
  });
  const documents = kDao.listDocuments({
    tenantId,
    knowledgeBaseId: kbId,
    knowledgeBaseVersionId: versionId,
  });

  const bundle = {
    okf_version: '0.1',
    format: 'json-compatible' as const,
    exported_at: Math.floor(Date.now() / 1000),
    knowledge_base: {
      id: kb.id,
      name: versionRow?.name ?? kb.name,
      description: versionRow ? versionRow.description : kb.description,
      version: versionRow?.version,
      status: kb.status,
    },
    concepts: concepts.map(kDao.toConceptRead),
    documents: documents.map(kDao.toDocumentRead),
  };

  res.json({
    code: 0,
    data: {
      implemented: true,
      format: 'json-compatible',
      knowledge_base_id: kbId,
      bundle,
    },
    message: 'ok',
  });
});

// ===================== POST /:kbId/okf/lint — JSON 兼容结构校验 =====================
// OKF 无正式公开 schema 规范，此处对已存储的概念做基础结构校验：
// 缺失 type / 标题 / 正文、断链、孤儿概念、重复标题。
router.post('/:kbId/okf/lint', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const kbId = req.params.kbId;
  const kb = kbDao.getKnowledgeBaseById(tenantId, kbId);
  if (!kb) {
    res.status(404).json({ code: 404, data: null, message: '知识库不存在' });
    return;
  }
  const agentId = req.body?.agent_id as string | undefined;
  const explicitVersion =
    (req.body?.knowledge_base_version_id as string | undefined) ??
    (req.query.knowledge_base_version_id as string | undefined);
  const versionRow = kbDao.getEffectiveKnowledgeBaseVersions(tenantId, agentId).get(kbId);
  const versionId = explicitVersion ?? versionRow?.id ?? 'default';

  const concepts = kDao
    .listConcepts({
      tenantId,
      knowledgeBaseId: kbId,
      knowledgeBaseVersionId: versionId,
    })
    .map(kDao.toConceptRead);

  const conceptIdSet = new Set(concepts.map((c) => c.concept_id));
  const inbound = new Map<string, number>();
  for (const c of concepts) inbound.set(c.concept_id, 0);
  const titleGroups = new Map<string, typeof concepts>();
  const errors: Array<Record<string, any>> = [];
  const warnings: Array<Record<string, any>> = [];

  for (const c of concepts) {
    const fm = c.frontmatter ?? {};
    const type = (c.concept_type || fm.type || '').trim();

    // 缺失 type — error
    if (!type) {
      errors.push({
        issue_type: 'missing_type',
        concept_id: c.concept_id,
        title: c.title,
        message: '概念缺少 type 字段。',
      });
    }

    // 缺失标题 — error
    if (!c.title || !c.title.trim()) {
      errors.push({
        issue_type: 'missing_title',
        concept_id: c.concept_id,
        title: c.title,
        message: '概念缺少标题。',
      });
    }

    // 缺失正文 — error
    if (!c.content_md || !c.content_md.trim()) {
      errors.push({
        issue_type: 'missing_content',
        concept_id: c.concept_id,
        title: c.title,
        message: '概念缺少正文内容。',
      });
    }

    // 缺失 citation — warning（Topic / Query Analysis 豁免）
    const citations = c.citations ?? [];
    if (
      citations.length === 0 &&
      type !== 'Topic' &&
      type !== 'Query Analysis'
    ) {
      warnings.push({
        issue_type: 'missing_citation',
        concept_id: c.concept_id,
        title: c.title,
        message: '概念没有 Citations 或外部来源引用。',
      });
    }

    // 断链检测 + 入站计数
    for (const link of c.links ?? []) {
      const target = String(link?.target || '').trim();
      if (!target) continue;
      if (/^(https?:|ultrarag:)/i.test(target)) continue; // 外部链接跳过
      const normalized = target.replace(/^\/+/, '').replace(/\.md$/i, '');
      if (conceptIdSet.has(normalized)) {
        inbound.set(normalized, (inbound.get(normalized) ?? 0) + 1);
      } else {
        errors.push({
          issue_type: 'broken_link',
          concept_id: c.concept_id,
          title: c.title,
          message: `链接目标不存在：${target}`,
        });
      }
    }

    // 重复标题分组
    const titleKey = (c.title || '').trim().toLowerCase();
    if (titleKey) {
      const group = titleGroups.get(titleKey) ?? [];
      group.push(c);
      titleGroups.set(titleKey, group);
    }
  }

  // 孤儿概念 — warning（Source Document 豁免）
  for (const c of concepts) {
    const type = (c.concept_type || c.frontmatter?.type || '').trim();
    if (type === 'Source Document') continue;
    if ((inbound.get(c.concept_id) ?? 0) === 0) {
      warnings.push({
        issue_type: 'orphan_concept',
        concept_id: c.concept_id,
        title: c.title,
        message: '概念没有入站链接，可能难以被渐进发现。',
      });
    }
  }

  // 重复标题 — warning
  for (const [, group] of titleGroups) {
    if (group.length <= 1) continue;
    for (const c of group) {
      warnings.push({
        issue_type: 'duplicate_title',
        concept_id: c.concept_id,
        title: c.title,
        message: `存在重复标题：${c.title}`,
      });
    }
  }

  res.json({
    code: 0,
    data: {
      implemented: true,
      format: 'json-compatible',
      knowledge_base_id: kbId,
      errors,
      warnings,
    },
    message: 'ok',
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
  res.json({ code: 0, data: readWithStats(tenantId, row), message: 'ok' });
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
  res.json({ code: 0, data: readWithStats(tenantId, row), message: 'ok' });
});

export default router;
