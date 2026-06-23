import { initDb } from '../db.js';
import type { SkillChainRow, SkillChainNodeRow, SkillChainExecutionRow, SkillAuditRow } from '../db.js';

// ===================== Skill Chain Execution Query DAO =====================

/** Get a skill execution by ID */
export function getSkillExecutionById(id: string): SkillChainExecutionRow | undefined {
  const db = initDb();
  return db.prepare('SELECT * FROM skill_chain_executions WHERE id = ?').get(id) as SkillChainExecutionRow | undefined;
}

/** Get chain name by ID */
export function getSkillChainNameById(id: string): string | undefined {
  const db = initDb();
  const row = db.prepare('SELECT name FROM skill_chains WHERE id = ?').get(id) as { name: string } | undefined;
  return row?.name;
}

// ===================== Skill Chain DAO =====================

/** Create a new skill chain */
export function createSkillChain(chain: {
  id: string;
  name: string;
  description?: string;
  failStrategy?: string;
  createdAt: string;
  updatedAt: string;
}): SkillChainRow {
  const db = initDb();
  const stmt = db.prepare(`INSERT INTO skill_chains (id, name, description, fail_strategy, created_at, updated_at) VALUES (?,?,?,?,?,?)`);
  stmt.run(
    chain.id,
    chain.name,
    chain.description ?? '',
    chain.failStrategy ?? 'stop',
    chain.createdAt,
    chain.updatedAt
  );
  return getSkillChain(chain.id)!;
}

/** Get a skill chain by ID */
export function getSkillChain(id: string): SkillChainRow | undefined {
  const db = initDb();
  return db.prepare('SELECT * FROM skill_chains WHERE id = ?').get(id) as SkillChainRow | undefined;
}

/** Get all skill chains */
export function getAllSkillChains(): SkillChainRow[] {
  const db = initDb();
  return db.prepare('SELECT * FROM skill_chains ORDER BY created_at DESC').all() as SkillChainRow[];
}

/** Update a skill chain */
export function updateSkillChain(id: string, data: Partial<{
  name: string;
  description: string;
  fail_strategy: string;
  updatedAt: string;
}>): void {
  const db = initDb();
  const existing = getSkillChain(id);
  if (!existing) return;
  const updated = {
    name: data.name ?? existing.name,
    description: data.description ?? existing.description,
    fail_strategy: data.fail_strategy ?? existing.fail_strategy,
    updated_at: data.updatedAt ?? new Date().toISOString(),
  };
  db.prepare('UPDATE skill_chains SET name=?, description=?, fail_strategy=?, updated_at=? WHERE id=?').run(
    updated.name,
    updated.description,
    updated.fail_strategy,
    updated.updated_at,
    id
  );
}

/** Delete a skill chain (cascade deletes nodes and executions) */
export function deleteSkillChain(id: string): void {
  const db = initDb();
  db.prepare('DELETE FROM skill_chains WHERE id = ?').run(id);
}

/** Create a chain node */
export function createChainNode(node: {
  id: string;
  chainId: string;
  skillId: string;
  skillName: string;
  skillIcon?: string;
  dataPassMode?: string;
  selectedFields?: string;
  customMapping?: string;
  timeout?: number;
  retryCount?: number;
  nodeOrder: number;
}): void {
  const db = initDb();
  db.prepare(`INSERT INTO skill_chain_nodes (id, chain_id, skill_id, skill_name, skill_icon, data_pass_mode, selected_fields, custom_mapping, timeout, retry_count, node_order)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    node.id,
    node.chainId,
    node.skillId,
    node.skillName,
    node.skillIcon ?? 'Extension',
    node.dataPassMode ?? 'full',
    node.selectedFields ?? '[]',
    node.customMapping ?? '{}',
    node.timeout ?? 30000,
    node.retryCount ?? 0,
    node.nodeOrder
  );
}

/** Get all nodes for a chain */
export function getChainNodes(chainId: string): SkillChainNodeRow[] {
  const db = initDb();
  return db.prepare('SELECT * FROM skill_chain_nodes WHERE chain_id = ? ORDER BY node_order ASC').all(chainId) as SkillChainNodeRow[];
}

/** Delete all nodes for a chain */
export function deleteChainNodes(chainId: string): void {
  const db = initDb();
  db.prepare('DELETE FROM skill_chain_nodes WHERE chain_id = ?').run(chainId);
}

// ===================== Transaction Helpers =====================

/** Create chain with nodes in a transaction */
export function createChainWithNodes(
  chain: Parameters<typeof createSkillChain>[0],
  nodes: Parameters<typeof createChainNode>[0][]
): SkillChainRow {
  const db = initDb();
  const tx = db.transaction(() => {
    createSkillChain(chain);
    for (const node of nodes) {
      createChainNode(node);
    }
  });
  tx();
  return getSkillChain(chain.id)!;
}

/** Update chain and replace all nodes in a transaction */
export function updateChainWithNodes(
  chainId: string,
  chainData: Parameters<typeof updateSkillChain>[1],
  nodes: Parameters<typeof createChainNode>[0][]
): void {
  const db = initDb();
  const tx = db.transaction(() => {
    updateSkillChain(chainId, chainData);
    deleteChainNodes(chainId);
    for (const node of nodes) {
      createChainNode(node);
    }
  });
  tx();
}

/** Duplicate a chain with all its nodes in a transaction */
export function duplicateChain(
  sourceChainId: string,
  newChainId: string,
  newName: string
): SkillChainRow {
  const db = initDb();
  const source = getSkillChain(sourceChainId);
  if (!source) throw new Error('Source chain not found');

  const tx = db.transaction(() => {
    createSkillChain({
      id: newChainId,
      name: newName,
      description: source.description,
      failStrategy: source.fail_strategy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const nodes = getChainNodes(sourceChainId);
    for (const node of nodes) {
      createChainNode({
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        chainId: newChainId,
        skillId: node.skill_id || '',
        skillName: node.skill_name || '',
        skillIcon: node.skill_icon,
        dataPassMode: node.data_pass_mode,
        selectedFields: node.selected_fields as string,
        customMapping: node.custom_mapping as string,
        timeout: node.timeout,
        retryCount: node.retry_count,
        nodeOrder: node.node_order,
      });
    }
  });
  tx();
  return getSkillChain(newChainId)!;
}

// ===================== Skill Audit DAO =====================

/** Create a skill audit record */
export function createSkillAudit(audit: {
  id: string;
  skillId: string;
  skillVersion: string;
  score: number;
  level: string;
  reportJson?: string;
  reportMarkdown?: string;
  triggeredBy?: string;
  createdAt?: string;
}): void {
  const db = initDb();
  db.prepare(`INSERT OR REPLACE INTO skill_audits (id, skill_id, skill_version, score, level, report_json, report_markdown, triggered_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    audit.id,
    audit.skillId,
    audit.skillVersion,
    audit.score,
    audit.level,
    audit.reportJson ?? '{}',
    audit.reportMarkdown ?? '',
    audit.triggeredBy ?? 'manual',
    audit.createdAt ?? new Date().toISOString()
  );
}

/** Get latest audit for a skill */
export function getLatestSkillAudit(skillId: string): SkillAuditRow | undefined {
  const db = initDb();
  return db.prepare('SELECT * FROM skill_audits WHERE skill_id = ? ORDER BY created_at DESC LIMIT 1').get(skillId) as SkillAuditRow | undefined;
}

/** Get audit history for a skill */
export function getSkillAuditHistory(skillId: string): SkillAuditRow[] {
  const db = initDb();
  return db.prepare('SELECT * FROM skill_audits WHERE skill_id = ? ORDER BY created_at DESC').all(skillId) as SkillAuditRow[];
}

/** Check if a specific skill version has been audited */
export function getSkillAuditByVersion(skillId: string, skillVersion: string): SkillAuditRow | undefined {
  const db = initDb();
  return db.prepare('SELECT * FROM skill_audits WHERE skill_id = ? AND skill_version = ?').get(skillId, skillVersion) as SkillAuditRow | undefined;
}

// ===================== Skill Chain Execution DAO =====================

/** Create a chain execution record */
export function createSkillExecution(execution: {
  id: string;
  chainId: string;
  status?: string;
  failStrategy?: string;
  steps?: string;
  nodeResults?: string;
  result?: string;
  startedAt?: string;
}): void {
  const db = initDb();
  db.prepare(`INSERT INTO skill_chain_executions (id, chain_id, status, fail_strategy, steps, node_results, result, started_at, completed_at, duration)
    VALUES (?,?,?,?,?,?,?,?,NULL,NULL)`).run(
    execution.id,
    execution.chainId,
    execution.status ?? 'running',
    execution.failStrategy ?? 'stop',
    execution.steps ?? '[]',
    execution.nodeResults ?? '[]',
    execution.result ?? '{}',
    execution.startedAt ?? new Date().toISOString()
  );
}

/** Update a chain execution record */
export function updateSkillExecution(id: string, data: Partial<{
  status: string;
  failStrategy: string;
  steps: string;
  nodeResults: string;
  result: string;
  completedAt: string | null;
  duration: number | null;
}>): void {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM skill_chain_executions WHERE id = ?').get(id) as SkillChainExecutionRow | undefined;
  if (!existing) return;
  const updated = {
    status: data.status ?? existing.status,
    fail_strategy: data.failStrategy ?? existing.fail_strategy,
    steps: data.steps ?? existing.steps,
    node_results: data.nodeResults ?? existing.node_results,
    result: data.result ?? existing.result,
    completed_at: data.completedAt !== undefined ? data.completedAt : existing.completed_at,
    duration: data.duration !== undefined ? data.duration : existing.duration,
  };
  db.prepare('UPDATE skill_chain_executions SET status=?, fail_strategy=?, steps=?, node_results=?, result=?, completed_at=?, duration=? WHERE id=?').run(
    updated.status,
    updated.fail_strategy,
    updated.steps,
    updated.node_results,
    updated.result,
    updated.completed_at,
    updated.duration,
    id
  );
}
