/**
 * StaffKnowledgeDao — Knowledge Document / Bucket / Chunk / Concept / Discovery / IngestJob CRUD
 *
 * 涉及表（6 张）：
 *   sd_knowledge_documents, sd_knowledge_buckets, sd_knowledge_chunks,
 *   sd_knowledge_concepts, sd_knowledge_discovery_suggestions, sd_knowledge_ingest_jobs
 */
import { initDb } from '../../db.js';
import { DEFAULT_TENANT_ID, newStaffId, StaffIdPrefix } from '../../db-staff.js';
import { embedBatch, embedText, ONNX_EMBEDDING_DIMENSIONS } from '../../engine/onnxEmbedding.js';
import { logger } from '../../logger.js';
import { chunkText } from '../../engine/shared/text-chunking.js';
import { cosineSimilarity } from '../../engine/plugins/embedding-capability.js';
import type {
  KnowledgeDocumentRow,
  KnowledgeBucketRow,
  KnowledgeChunkRow,
  KnowledgeConceptRow,
  KnowledgeDiscoverySuggestionRow,
  KnowledgeIngestJobRow,
} from '../../types/staff.js';

const now = (): number => Math.floor(Date.now() / 1000);

function safeJsonObj(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function safeJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ===================== Documents =====================

export function toDocumentRead(row: KnowledgeDocumentRow) {
  return {
    ...row,
    metadata: safeJsonObj(row.metadata_json),
  };
}

export interface DocumentListFilter {
  tenantId?: string;
  knowledgeBaseId?: string;
  knowledgeBaseVersionId?: string;
  status?: string;
  fileType?: string;
}

export function listDocuments(filter: DocumentListFilter = {}): KnowledgeDocumentRow[] {
  const db = initDb();
  const tenantId = filter.tenantId ?? DEFAULT_TENANT_ID;
  const conditions: string[] = ['tenant_id = ?'];
  const params: unknown[] = [tenantId];
  if (filter.knowledgeBaseId) {
    conditions.push('knowledge_base_id = ?');
    params.push(filter.knowledgeBaseId);
  }
  if (filter.knowledgeBaseVersionId) {
    conditions.push('knowledge_base_version_id = ?');
    params.push(filter.knowledgeBaseVersionId);
  }
  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  if (filter.fileType) {
    conditions.push('file_type = ?');
    params.push(filter.fileType);
  }
  const sql = `SELECT * FROM sd_knowledge_documents WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
  return db.prepare(sql).all(...params) as KnowledgeDocumentRow[];
}

export function getDocumentById(
  tenantId: string,
  documentId: string,
): KnowledgeDocumentRow | undefined {
  const db = initDb();
  return db
    .prepare(`SELECT * FROM sd_knowledge_documents WHERE tenant_id = ? AND id = ?`)
    .get(tenantId, documentId) as KnowledgeDocumentRow | undefined;
}

export interface DocumentInput {
  tenant_id?: string;
  knowledge_base_id: string;
  knowledge_base_version_id?: string | null;
  filename: string;
  file_type: string;
  title?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
}

export function createDocument(input: DocumentInput): KnowledgeDocumentRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const id = newStaffId(StaffIdPrefix.knowledgeDocument);
  const ts = now();
  db.prepare(
    `INSERT INTO sd_knowledge_documents
       (id, tenant_id, knowledge_base_id, knowledge_base_version_id, filename, file_type,
        title, status, bucket_count, chunk_count, metadata_json, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, NULL, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.knowledge_base_id,
    input.knowledge_base_version_id ?? null,
    input.filename,
    input.file_type,
    input.title ?? null,
    input.status ?? 'processing',
    JSON.stringify(input.metadata ?? {}),
    ts,
    ts,
  );
  return db.prepare(`SELECT * FROM sd_knowledge_documents WHERE id = ?`).get(id) as KnowledgeDocumentRow;
}

export interface DocumentUpdateInput {
  filename?: string;
  file_type?: string;
  title?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
  error?: string | null;
}

export function updateDocument(
  tenantId: string,
  documentId: string,
  patch: DocumentUpdateInput,
): KnowledgeDocumentRow | null {
  const db = initDb();
  const existing = getDocumentById(tenantId, documentId);
  if (!existing) return null;
  const ts = now();
  const next: KnowledgeDocumentRow = {
    ...existing,
    filename: patch.filename ?? existing.filename,
    file_type: patch.file_type ?? existing.file_type,
    title: patch.title !== undefined ? patch.title : existing.title,
    status: patch.status ?? existing.status,
    metadata_json:
      patch.metadata !== undefined ? JSON.stringify(patch.metadata) : existing.metadata_json,
    error: patch.error !== undefined ? patch.error : existing.error,
    updated_at: ts,
  };
  db.prepare(
    `UPDATE sd_knowledge_documents
     SET filename = ?, file_type = ?, title = ?, status = ?, metadata_json = ?, error = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    next.filename,
    next.file_type,
    next.title,
    next.status,
    next.metadata_json,
    next.error,
    next.updated_at,
    existing.id,
  );
  return next;
}

export function deleteDocument(tenantId: string, documentId: string): boolean {
  const db = initDb();
  const existing = getDocumentById(tenantId, documentId);
  if (!existing) return false;
  db.prepare(`DELETE FROM sd_knowledge_buckets WHERE tenant_id = ? AND document_id = ?`)
    .run(tenantId, documentId);
  db.prepare(`DELETE FROM sd_knowledge_chunks WHERE tenant_id = ? AND document_id = ?`)
    .run(tenantId, documentId);
  db.prepare(`DELETE FROM sd_knowledge_discovery_suggestions WHERE tenant_id = ? AND document_id = ?`)
    .run(tenantId, documentId);
  db.prepare(`DELETE FROM sd_knowledge_documents WHERE id = ?`).run(existing.id);
  return true;
}

// ===================== Buckets =====================

export function listBucketsByDocument(
  tenantId: string,
  documentId: string,
): KnowledgeBucketRow[] {
  const db = initDb();
  return db
    .prepare(
      `SELECT * FROM sd_knowledge_buckets WHERE tenant_id = ? AND document_id = ? ORDER BY created_at ASC`,
    )
    .all(tenantId, documentId) as KnowledgeBucketRow[];
}

export function getBucketById(
  tenantId: string,
  bucketId: string,
): KnowledgeBucketRow | undefined {
  const db = initDb();
  return db
    .prepare(`SELECT * FROM sd_knowledge_buckets WHERE tenant_id = ? AND id = ?`)
    .get(tenantId, bucketId) as KnowledgeBucketRow | undefined;
}

export interface BucketInput {
  tenant_id?: string;
  knowledge_base_id: string;
  document_id: string;
  bucket_id: string;
  knowledge_base_version_id?: string | null;
  bucket_key: string;
  title: string;
  summary: string;
  token_estimate?: number;
  metadata?: Record<string, unknown>;
}

export function createBucket(input: BucketInput): KnowledgeBucketRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const id = newStaffId(StaffIdPrefix.knowledgeBucket);
  const ts = now();
  db.prepare(
    `INSERT INTO sd_knowledge_buckets
       (id, tenant_id, knowledge_base_id, document_id, bucket_id, knowledge_base_version_id,
        bucket_key, title, summary, token_estimate, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.knowledge_base_id,
    input.document_id,
    input.bucket_id,
    input.knowledge_base_version_id ?? null,
    input.bucket_key,
    input.title,
    input.summary,
    input.token_estimate ?? 0,
    JSON.stringify(input.metadata ?? {}),
    ts,
    ts,
  );
  return db.prepare(`SELECT * FROM sd_knowledge_buckets WHERE id = ?`).get(id) as KnowledgeBucketRow;
}

export interface BucketUpdateInput {
  title?: string;
  summary?: string;
  token_estimate?: number;
  metadata?: Record<string, unknown>;
}

export function updateBucket(
  tenantId: string,
  bucketId: string,
  patch: BucketUpdateInput,
): KnowledgeBucketRow | null {
  const db = initDb();
  const existing = getBucketById(tenantId, bucketId);
  if (!existing) return null;
  const ts = now();
  const next: KnowledgeBucketRow = {
    ...existing,
    title: patch.title ?? existing.title,
    summary: patch.summary ?? existing.summary,
    token_estimate: patch.token_estimate ?? existing.token_estimate,
    metadata_json:
      patch.metadata !== undefined ? JSON.stringify(patch.metadata) : existing.metadata_json,
    updated_at: ts,
  };
  db.prepare(
    `UPDATE sd_knowledge_buckets
     SET title = ?, summary = ?, token_estimate = ?, metadata_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    next.title,
    next.summary,
    next.token_estimate,
    next.metadata_json,
    next.updated_at,
    existing.id,
  );
  return next;
}

// ===================== Chunks =====================

export function listChunksByBucket(
  tenantId: string,
  bucketId: string,
): KnowledgeChunkRow[] {
  const db = initDb();
  return db
    .prepare(
      `SELECT * FROM sd_knowledge_chunks WHERE tenant_id = ? AND bucket_id = ? ORDER BY chunk_index ASC`,
    )
    .all(tenantId, bucketId) as KnowledgeChunkRow[];
}

export function getChunkById(
  tenantId: string,
  chunkId: string,
): KnowledgeChunkRow | undefined {
  const db = initDb();
  return db
    .prepare(`SELECT * FROM sd_knowledge_chunks WHERE tenant_id = ? AND id = ?`)
    .get(tenantId, chunkId) as KnowledgeChunkRow | undefined;
}

export interface ChunkInput {
  tenant_id?: string;
  knowledge_base_id: string;
  document_id: string;
  bucket_id: string;
  knowledge_base_version_id?: string | null;
  chunk_index: number;
  content: string;
  summary?: string | null;
  source_ref?: string | null;
  embedding?: string | null;
  metadata?: Record<string, unknown>;
}

export function createChunk(input: ChunkInput): KnowledgeChunkRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const id = newStaffId(StaffIdPrefix.knowledgeChunk);
  const ts = now();
  db.prepare(
    `INSERT INTO sd_knowledge_chunks
       (id, tenant_id, knowledge_base_id, document_id, bucket_id, knowledge_base_version_id,
        chunk_index, content, summary, source_ref, embedding, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.knowledge_base_id,
    input.document_id,
    input.bucket_id,
    input.knowledge_base_version_id ?? null,
    input.chunk_index,
    input.content,
    input.summary ?? null,
    input.source_ref ?? null,
    input.embedding ?? null,
    JSON.stringify(input.metadata ?? {}),
    ts,
    ts,
  );
  return db.prepare(`SELECT * FROM sd_knowledge_chunks WHERE id = ?`).get(id) as KnowledgeChunkRow;
}

export interface ChunkUpdateInput {
  content?: string;
  summary?: string | null;
  source_ref?: string | null;
  metadata?: Record<string, unknown>;
}

export function updateChunk(
  tenantId: string,
  chunkId: string,
  patch: ChunkUpdateInput,
): KnowledgeChunkRow | null {
  const db = initDb();
  const existing = getChunkById(tenantId, chunkId);
  if (!existing) return null;
  const ts = now();
  const next: KnowledgeChunkRow = {
    ...existing,
    content: patch.content ?? existing.content,
    summary: patch.summary !== undefined ? patch.summary : existing.summary,
    source_ref: patch.source_ref !== undefined ? patch.source_ref : existing.source_ref,
    metadata_json:
      patch.metadata !== undefined ? JSON.stringify(patch.metadata) : existing.metadata_json,
    updated_at: ts,
  };
  db.prepare(
    `UPDATE sd_knowledge_chunks
     SET content = ?, summary = ?, source_ref = ?, metadata_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    next.content,
    next.summary,
    next.source_ref,
    next.metadata_json,
    next.updated_at,
    existing.id,
  );
  return next;
}

// ===================== Concepts (OKF) =====================

export interface ConceptListFilter {
  tenantId?: string;
  knowledgeBaseId?: string;
  knowledgeBaseVersionId?: string;
  conceptType?: string;
  documentId?: string;
  status?: string;
}

export function listConcepts(filter: ConceptListFilter = {}): KnowledgeConceptRow[] {
  const db = initDb();
  const tenantId = filter.tenantId ?? DEFAULT_TENANT_ID;
  const conditions: string[] = ['tenant_id = ?'];
  const params: unknown[] = [tenantId];
  if (filter.knowledgeBaseId) {
    conditions.push('knowledge_base_id = ?');
    params.push(filter.knowledgeBaseId);
  }
  if (filter.knowledgeBaseVersionId) {
    conditions.push('knowledge_base_version_id = ?');
    params.push(filter.knowledgeBaseVersionId);
  }
  if (filter.conceptType) {
    conditions.push('concept_type = ?');
    params.push(filter.conceptType);
  }
  if (filter.documentId) {
    conditions.push('document_id = ?');
    params.push(filter.documentId);
  }
  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  const sql = `SELECT * FROM sd_knowledge_concepts WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
  return db.prepare(sql).all(...params) as KnowledgeConceptRow[];
}

export function getConceptByConceptId(
  tenantId: string,
  knowledgeBaseVersionId: string,
  conceptId: string,
): KnowledgeConceptRow | undefined {
  const db = initDb();
  return db
    .prepare(
      `SELECT * FROM sd_knowledge_concepts
       WHERE tenant_id = ? AND knowledge_base_version_id = ? AND concept_id = ?`,
    )
    .get(tenantId, knowledgeBaseVersionId, conceptId) as KnowledgeConceptRow | undefined;
}

export interface ConceptInput {
  tenant_id?: string;
  knowledge_base_id: string;
  concept_id: string;
  concept_type: string;
  knowledge_base_version_id?: string | null;
  document_id?: string | null;
  title: string;
  description?: string | null;
  content_md: string;
  frontmatter?: Record<string, unknown>;
  links?: unknown[];
  citations?: unknown[];
  source_refs?: unknown[];
  status?: string;
}

export function upsertConcept(input: ConceptInput): KnowledgeConceptRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const kbVersionId = input.knowledge_base_version_id ?? 'default';
  const existing = getConceptByConceptId(tenantId, kbVersionId, input.concept_id);
  const ts = now();
  const frontmatterJson = JSON.stringify(input.frontmatter ?? {});
  const linksJson = JSON.stringify(input.links ?? []);
  const citationsJson = JSON.stringify(input.citations ?? []);
  const sourceRefsJson = JSON.stringify(input.source_refs ?? []);
  if (existing) {
    db.prepare(
      `UPDATE sd_knowledge_concepts
       SET concept_type = ?, document_id = ?, title = ?, description = ?, content_md = ?,
           frontmatter_json = ?, links_json = ?, citations_json = ?, source_refs_json = ?,
           status = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.concept_type,
      input.document_id ?? null,
      input.title,
      input.description ?? null,
      input.content_md,
      frontmatterJson,
      linksJson,
      citationsJson,
      sourceRefsJson,
      input.status ?? 'active',
      ts,
      existing.id,
    );
    return { ...existing, title: input.title, updated_at: ts };
  }
  const id = newStaffId(StaffIdPrefix.knowledgeConcept);
  db.prepare(
    `INSERT INTO sd_knowledge_concepts
       (id, tenant_id, knowledge_base_id, concept_id, concept_type, knowledge_base_version_id,
        document_id, title, description, content_md, frontmatter_json, links_json,
        citations_json, source_refs_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.knowledge_base_id,
    input.concept_id,
    input.concept_type,
    kbVersionId,
    input.document_id ?? null,
    input.title,
    input.description ?? null,
    input.content_md,
    frontmatterJson,
    linksJson,
    citationsJson,
    sourceRefsJson,
    input.status ?? 'active',
    ts,
    ts,
  );
  return db.prepare(`SELECT * FROM sd_knowledge_concepts WHERE id = ?`).get(id) as KnowledgeConceptRow;
}

export interface ConceptUpdateInput {
  concept_type?: string;
  document_id?: string | null;
  title?: string;
  description?: string | null;
  content_md?: string;
  frontmatter?: Record<string, unknown>;
  links?: unknown[];
  citations?: unknown[];
  source_refs?: unknown[];
  status?: string;
}

export function updateConcept(
  tenantId: string,
  kbVersionId: string,
  conceptId: string,
  patch: ConceptUpdateInput,
): KnowledgeConceptRow | null {
  const db = initDb();
  const existing = getConceptByConceptId(tenantId, kbVersionId, conceptId);
  if (!existing) return null;
  const ts = now();
  const next: KnowledgeConceptRow = {
    ...existing,
    concept_type: patch.concept_type ?? existing.concept_type,
    document_id: patch.document_id !== undefined ? patch.document_id : existing.document_id,
    title: patch.title ?? existing.title,
    description: patch.description !== undefined ? patch.description : existing.description,
    content_md: patch.content_md ?? existing.content_md,
    frontmatter_json:
      patch.frontmatter !== undefined ? JSON.stringify(patch.frontmatter) : existing.frontmatter_json,
    links_json: patch.links !== undefined ? JSON.stringify(patch.links) : existing.links_json,
    citations_json:
      patch.citations !== undefined ? JSON.stringify(patch.citations) : existing.citations_json,
    source_refs_json:
      patch.source_refs !== undefined ? JSON.stringify(patch.source_refs) : existing.source_refs_json,
    status: patch.status ?? existing.status,
    updated_at: ts,
  };
  db.prepare(
    `UPDATE sd_knowledge_concepts
     SET concept_type = ?, document_id = ?, title = ?, description = ?, content_md = ?,
         frontmatter_json = ?, links_json = ?, citations_json = ?, source_refs_json = ?,
         status = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    next.concept_type,
    next.document_id,
    next.title,
    next.description,
    next.content_md,
    next.frontmatter_json,
    next.links_json,
    next.citations_json,
    next.source_refs_json,
    next.status,
    next.updated_at,
    existing.id,
  );
  return next;
}

export function toConceptRead(row: KnowledgeConceptRow) {
  return {
    ...row,
    frontmatter: safeJsonObj(row.frontmatter_json),
    links: safeJsonArray(row.links_json),
    citations: safeJsonArray(row.citations_json),
    source_refs: safeJsonArray(row.source_refs_json),
  };
}

// ===================== Discovery Suggestions =====================

export interface DiscoveryListFilter {
  tenantId?: string;
  knowledgeBaseId?: string;
  documentId?: string;
  suggestionType?: string;
  status?: string;
}

export function listDiscoveries(filter: DiscoveryListFilter = {}): KnowledgeDiscoverySuggestionRow[] {
  const db = initDb();
  const tenantId = filter.tenantId ?? DEFAULT_TENANT_ID;
  const conditions: string[] = ['tenant_id = ?'];
  const params: unknown[] = [tenantId];
  if (filter.knowledgeBaseId) {
    conditions.push('knowledge_base_id = ?');
    params.push(filter.knowledgeBaseId);
  }
  if (filter.documentId) {
    conditions.push('document_id = ?');
    params.push(filter.documentId);
  }
  if (filter.suggestionType) {
    conditions.push('suggestion_type = ?');
    params.push(filter.suggestionType);
  }
  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  const sql = `SELECT * FROM sd_knowledge_discovery_suggestions WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
  return db.prepare(sql).all(...params) as KnowledgeDiscoverySuggestionRow[];
}

export function getDiscoveryById(
  tenantId: string,
  suggestionId: string,
): KnowledgeDiscoverySuggestionRow | undefined {
  const db = initDb();
  return db
    .prepare(`SELECT * FROM sd_knowledge_discovery_suggestions WHERE tenant_id = ? AND id = ?`)
    .get(tenantId, suggestionId) as KnowledgeDiscoverySuggestionRow | undefined;
}

export interface DiscoveryInput {
  tenant_id?: string;
  knowledge_base_id: string;
  document_id: string;
  suggestion_type: string;
  knowledge_base_version_id?: string | null;
  bucket_id?: string | null;
  title: string;
  status?: string;
  payload?: Record<string, unknown>;
  source_refs?: unknown[];
  reason?: string | null;
}

export function createDiscovery(input: DiscoveryInput): KnowledgeDiscoverySuggestionRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const id = newStaffId(StaffIdPrefix.knowledgeDiscovery);
  const ts = now();
  db.prepare(
    `INSERT INTO sd_knowledge_discovery_suggestions
       (id, tenant_id, knowledge_base_id, document_id, suggestion_type, knowledge_base_version_id,
        bucket_id, title, status, payload_json, source_refs_json, reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.knowledge_base_id,
    input.document_id,
    input.suggestion_type,
    input.knowledge_base_version_id ?? null,
    input.bucket_id ?? null,
    input.title,
    input.status ?? 'pending',
    JSON.stringify(input.payload ?? {}),
    JSON.stringify(input.source_refs ?? []),
    input.reason ?? null,
    ts,
    ts,
  );
  return db
    .prepare(`SELECT * FROM sd_knowledge_discovery_suggestions WHERE id = ?`)
    .get(id) as KnowledgeDiscoverySuggestionRow;
}

export function updateDiscoveryStatus(
  tenantId: string,
  suggestionId: string,
  status: string,
): KnowledgeDiscoverySuggestionRow | null {
  const db = initDb();
  const existing = getDiscoveryById(tenantId, suggestionId);
  if (!existing) return null;
  const ts = now();
  db.prepare(
    `UPDATE sd_knowledge_discovery_suggestions SET status = ?, updated_at = ? WHERE id = ?`,
  ).run(status, ts, existing.id);
  return { ...existing, status, updated_at: ts };
}

// ===================== Ingest Jobs =====================

export interface JobListFilter {
  tenantId?: string;
  knowledgeBaseId?: string;
  documentId?: string;
  status?: string;
}

export function listIngestJobs(filter: JobListFilter = {}): KnowledgeIngestJobRow[] {
  const db = initDb();
  const tenantId = filter.tenantId ?? DEFAULT_TENANT_ID;
  const conditions: string[] = ['tenant_id = ?'];
  const params: unknown[] = [tenantId];
  if (filter.knowledgeBaseId) {
    conditions.push('knowledge_base_id = ?');
    params.push(filter.knowledgeBaseId);
  }
  if (filter.documentId) {
    conditions.push('document_id = ?');
    params.push(filter.documentId);
  }
  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  const sql = `SELECT * FROM sd_knowledge_ingest_jobs WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
  return db.prepare(sql).all(...params) as KnowledgeIngestJobRow[];
}

export function getIngestJobById(
  tenantId: string,
  jobId: string,
): KnowledgeIngestJobRow | undefined {
  const db = initDb();
  return db
    .prepare(`SELECT * FROM sd_knowledge_ingest_jobs WHERE tenant_id = ? AND id = ?`)
    .get(tenantId, jobId) as KnowledgeIngestJobRow | undefined;
}

export interface IngestJobInput {
  tenant_id?: string;
  knowledge_base_id: string;
  knowledge_base_version_id?: string | null;
  document_id?: string | null;
  filename: string;
  status?: string;
  stage?: string;
  progress?: number;
  error?: string | null;
  metadata?: Record<string, unknown>;
  started_at?: number | null;
  finished_at?: number | null;
}

export function createIngestJob(input: IngestJobInput): KnowledgeIngestJobRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const id = newStaffId(StaffIdPrefix.knowledgeIngestJob);
  const ts = now();
  db.prepare(
    `INSERT INTO sd_knowledge_ingest_jobs
       (id, tenant_id, knowledge_base_id, knowledge_base_version_id, document_id, filename,
        status, stage, progress, error, metadata_json, started_at, finished_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.knowledge_base_id,
    input.knowledge_base_version_id ?? null,
    input.document_id ?? null,
    input.filename,
    input.status ?? 'queued',
    input.stage ?? 'queued',
    input.progress ?? 0.0,
    input.error ?? null,
    JSON.stringify(input.metadata ?? {}),
    input.started_at ?? null,
    input.finished_at ?? null,
    ts,
    ts,
  );
  return db.prepare(`SELECT * FROM sd_knowledge_ingest_jobs WHERE id = ?`).get(id) as KnowledgeIngestJobRow;
}

export interface IngestJobUpdateInput {
  status?: string;
  stage?: string;
  progress?: number;
  error?: string | null;
  metadata?: Record<string, unknown>;
  started_at?: number | null;
  finished_at?: number | null;
}

export function updateIngestJob(
  tenantId: string,
  jobId: string,
  patch: IngestJobUpdateInput,
): KnowledgeIngestJobRow | null {
  const db = initDb();
  const existing = getIngestJobById(tenantId, jobId);
  if (!existing) return null;
  const ts = now();
  const next: KnowledgeIngestJobRow = {
    ...existing,
    status: patch.status ?? existing.status,
    stage: patch.stage ?? existing.stage,
    progress: patch.progress ?? existing.progress,
    error: patch.error !== undefined ? patch.error : existing.error,
    metadata_json:
      patch.metadata !== undefined ? JSON.stringify(patch.metadata) : existing.metadata_json,
    started_at: patch.started_at !== undefined ? patch.started_at : existing.started_at,
    finished_at: patch.finished_at !== undefined ? patch.finished_at : existing.finished_at,
    updated_at: ts,
  };
  db.prepare(
    `UPDATE sd_knowledge_ingest_jobs
     SET status = ?, stage = ?, progress = ?, error = ?, metadata_json = ?,
         started_at = ?, finished_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    next.status,
    next.stage,
    next.progress,
    next.error,
    next.metadata_json,
    next.started_at,
    next.finished_at,
    next.updated_at,
    existing.id,
  );
  return next;
}

// ===================== Ingest (真实文本入库管线：切分 → 向量化 → 落库) =====================

/**
 * 将长文本切分为有界块：优先在换行/句号等自然断点处截断，避免截断句子；
 * 块之间保留 overlap 字符重叠以保留上下文连续性。
 * 委托主程序共享的 chunkText（server/engine/shared/text-chunking.ts），不再自维护平行逻辑。
 */
export function splitKnowledgeChunks(
  text: string,
  chunkSize = 600,
  overlap = 80,
): string[] {
  return chunkText(text, { maxChars: chunkSize, overlapChars: overlap });
}

export interface IngestTextInput {
  tenant_id?: string;
  knowledge_base_id: string;
  knowledge_base_version_id?: string | null;
  document_id: string;
  title?: string | null;
  text: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface IngestTextResult {
  chunkCount: number;
  bucketId: string;
}

/**
 * 真实入库：把一段文本切分、向量化（all-MiniLM-L6-v2, 384 维，L2 归一化）并写入 chunks。
 * 向量化失败时降级（embedding 置空），搜索自动回退到 LIKE。
 * 同时把 document 状态置为 indexed、把对应 ingest job 标记 completed。
 */
export async function ingestDocumentText(input: IngestTextInput): Promise<IngestTextResult> {
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const pieces = splitKnowledgeChunks(input.text, input.chunkSize ?? 600, input.chunkOverlap ?? 80);
  if (pieces.length === 0) {
    return { chunkCount: 0, bucketId: '' };
  }

  // 1. 每个文档建一个默认 bucket（桶名取文档标题）
  const bucketTitle = input.title || '未命名文档';
  const bucketKey = `doc-${input.document_id}`;
  const bucket = createBucket({
    tenant_id: tenantId,
    knowledge_base_id: input.knowledge_base_id,
    document_id: input.document_id,
    bucket_id: bucketKey,
    knowledge_base_version_id: input.knowledge_base_version_id ?? null,
    bucket_key: bucketKey,
    title: bucketTitle,
    summary: `由 ${pieces.length} 个文本块组成`,
    metadata: { auto: true, source: 'text' },
  });

  // 2. 批量向量化
  let vectors: Float32Array[] = [];
  try {
    vectors = await embedBatch(pieces);
  } catch (e) {
    logger.warn('[StaffK] 向量化失败，仅存储文本（搜索降级为 LIKE）:', e instanceof Error ? e.message : String(e));
    vectors = pieces.map(() => new Float32Array(ONNX_EMBEDDING_DIMENSIONS));
  }

  // 3. 逐块落库
  for (let i = 0; i < pieces.length; i++) {
    const vec = vectors[i];
    const embedding =
      vec && vec.length === ONNX_EMBEDDING_DIMENSIONS ? JSON.stringify(Array.from(vec)) : null;
    createChunk({
      tenant_id: tenantId,
      knowledge_base_id: input.knowledge_base_id,
      document_id: input.document_id,
      bucket_id: bucket.id,
      knowledge_base_version_id: input.knowledge_base_version_id ?? null,
      chunk_index: i,
      content: pieces[i],
      summary: pieces[i].slice(0, 120),
      source_ref: `chunk#${i}`,
      embedding,
      metadata: { doc_title: bucketTitle },
    });
  }

  // 4. 更新 document + ingest job 状态
  updateDocument(tenantId, input.document_id, {
    status: 'indexed',
    title: input.title ?? null,
    metadata: { chunk_count: pieces.length, bucket_count: 1 },
  });
  const jobs = listIngestJobs({ tenantId, documentId: input.document_id });
  const job = jobs[0];
  if (job) {
    updateIngestJob(tenantId, job.id, {
      status: 'completed',
      stage: 'done',
      progress: 100,
      finished_at: Math.floor(Date.now() / 1000),
      metadata: { chunk_count: pieces.length },
    });
  }
  logger.info('[StaffK] 文本入库完成', { docId: input.document_id, chunkCount: pieces.length, bucketId: bucket.id });
  return { chunkCount: pieces.length, bucketId: bucket.id };
}

// ===================== Search (向量语义 + LIKE 混合) =====================

export interface KnowledgeSearchHit {
  chunk: KnowledgeChunkRow;
  bucket: KnowledgeBucketRow | null;
  document: KnowledgeDocumentRow | null;
  score: number;
}

export interface KnowledgeSearchInput {
  tenant_id?: string;
  knowledge_base_id?: string;
  knowledge_base_version_id?: string;
  query: string;
  limit?: number;
}

/**
 * 知识库检索：优先向量语义检索（all-MiniLM-L6-v2, 384 维，L2 归一化 → 点积即余弦相似度），
 * 向量不可用时（缺失 embedding 或 ONNX 未加载）回退到 LIKE 弱信号。返回按 score 降序的命中。
 */
export async function searchKnowledge(input: KnowledgeSearchInput): Promise<KnowledgeSearchHit[]> {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const limit = Math.max(1, Math.min(100, input.limit ?? 20));
  const q = (input.query || '').trim();
  if (!q) return [];

  const scopeConditions: string[] = ['tenant_id = ?'];
  const scopeParams: unknown[] = [tenantId];
  if (input.knowledge_base_id) {
    scopeConditions.push('knowledge_base_id = ?');
    scopeParams.push(input.knowledge_base_id);
  }
  if (input.knowledge_base_version_id) {
    scopeConditions.push('knowledge_base_version_id = ?');
    scopeParams.push(input.knowledge_base_version_id);
  }
  const candidates = db
    .prepare(`SELECT * FROM sd_knowledge_chunks WHERE ${scopeConditions.join(' AND ')}`)
    .all(...scopeParams) as KnowledgeChunkRow[];
  if (candidates.length === 0) return [];

  // 查询向量（失败/超时降级为 null → 走 LIKE 兜底）
  let queryVec: Float32Array | null = null;
  try {
    queryVec = await embedText(q);
  } catch {
    queryVec = null;
  }
  const qLower = q.toLowerCase();
  const hasVec = queryVec !== null && queryVec.length === ONNX_EMBEDDING_DIMENSIONS;
  const queryVecArr = hasVec && queryVec ? Array.from(queryVec) : [];

  const scored = candidates.map((chunk) => {
    let score = 0;
    if (hasVec && chunk.embedding) {
      try {
        const v = JSON.parse(chunk.embedding) as number[];
        if (v.length === ONNX_EMBEDDING_DIMENSIONS) {
          // 复用主程序共享的余弦相似度（向量已 L2 归一化，cosine == dot）
          score = Math.max(0, cosineSimilarity(v, queryVecArr));
        }
      } catch {
        // 损坏的 embedding 字段，忽略
      }
    }
    // 向量未命中时的弱信号兜底
    if (score === 0 && chunk.content.toLowerCase().includes(qLower)) {
      score = 0.3 * (q.length / Math.max(1, chunk.content.length));
    }
    return { chunk, score };
  });

  const ranked = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked.map(({ chunk, score }) => {
    const bucket = db
      .prepare(`SELECT * FROM sd_knowledge_buckets WHERE tenant_id = ? AND id = ?`)
      .get(tenantId, chunk.bucket_id) as KnowledgeBucketRow | null;
    const document = db
      .prepare(`SELECT * FROM sd_knowledge_documents WHERE tenant_id = ? AND id = ?`)
      .get(tenantId, chunk.document_id) as KnowledgeDocumentRow | null;
    return { chunk, bucket, document, score };
  });
}
