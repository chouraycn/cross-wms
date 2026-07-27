/**
 * 知识库 DAO 单测（IS_PASS）。内存 SQLite + mock db.js，覆盖 CRUD + 版本 + 分支同步/提升。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

const mockDb = new Database(':memory:');

vi.mock('../../../db.js', () => ({
  initDb: vi.fn(() => mockDb),
}));

import { initStaffTables } from '../../../db-staff.js';
import * as kbDao from '../staffKnowledgeBaseDao.js';

beforeEach(() => {
  mockDb.exec('DROP TABLE IF EXISTS sd_knowledge_bases');
  mockDb.exec('DROP TABLE IF EXISTS sd_knowledge_base_versions');
  mockDb.exec('DROP TABLE IF EXISTS sd_agent_knowledge_branches');
  mockDb.exec('DROP TABLE IF EXISTS sd_agent_profiles');
  initStaffTables(mockDb);
});

describe('staffKnowledgeBaseDao CRUD', () => {
  it('createKnowledgeBase 写入并自动建首个版本', () => {
    const row = kbDao.createKnowledgeBase({ name: 'KB1', description: 'd', metadata: { a: 1 } });
    expect(row.id).toBeTruthy();
    expect(row.name).toBe('KB1');
    expect(row.status).toBe('active');
    const versions = kbDao.listKnowledgeBaseVersions(row.tenant_id, row.id);
    expect(versions.length).toBe(1);
    expect(versions[0].version).toBe('1.0.0');
  });

  it('getKnowledgeBaseById / listKnowledgeBases', () => {
    const a = kbDao.createKnowledgeBase({ name: 'A' });
    kbDao.createKnowledgeBase({ name: 'B' });
    expect(kbDao.getKnowledgeBaseById(a.tenant_id, a.id)?.name).toBe('A');
    expect(kbDao.listKnowledgeBases({ tenantId: a.tenant_id }).length).toBeGreaterThanOrEqual(2);
  });

  it('updateKnowledgeBase 更新字段', () => {
    const row = kbDao.createKnowledgeBase({ name: 'A' });
    const updated = kbDao.updateKnowledgeBase(row.tenant_id, row.id, { name: 'A2', status: 'archived' });
    expect(updated?.name).toBe('A2');
    expect(updated?.status).toBe('archived');
  });

  it('deleteKnowledgeBase 删除', () => {
    const row = kbDao.createKnowledgeBase({ name: 'A' });
    expect(kbDao.deleteKnowledgeBase(row.tenant_id, row.id)).toBe(true);
    expect(kbDao.getKnowledgeBaseById(row.tenant_id, row.id)).toBeUndefined();
  });
});

describe('staffKnowledgeBaseDao 分支同步/提升', () => {
  it('syncAgentKnowledgeBranchFromOverall / promoteAgentKnowledgeBranchToOverall 往返', () => {
    // 准备一个 overall KB
    const overallKb = kbDao.createKnowledgeBase({ name: 'Overall', metadata: { scope: 'overall' } });
    // 准备一个 agent（sd_agent_profiles 需存在以满足外键/逻辑）
    const db = mockDb;
    db.prepare(
      `INSERT INTO sd_agent_profiles (id, tenant_id, name, description, persona_prompt, status, is_overall, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('agent-1', overallKb.tenant_id, 'Agent1', '', 'p', 'active', 0, '{}', 1, 1);

    const synced = kbDao.syncAgentKnowledgeBranchFromOverall(overallKb.tenant_id, 'agent-1', overallKb.id);
    expect(synced).toBeDefined();

    const promoted = kbDao.promoteAgentKnowledgeBranchToOverall(overallKb.tenant_id, 'agent-1', overallKb.id);
    expect(promoted).toBeDefined();
  });
});
