/**
 * 数字员工 × 程序 skill 联动 E2E
 *
 * 验证「主程序 skill 系统」接入数字员工工具目录 + 执行门控：
 *  - GET  /program-skills        → 列出主程序已注册技能（含原生）
 *  - POST /program-skills/sync   → 将技能 upsert 进 sd_tools（tool_type='skill', config.skillId）
 *  - resolveStaffSkillPermissionConfig → 门控配置解析（opt-in）
 *
 * skillRegistry 在 vitest 下用 vi.mock 注入确定性数据，避免依赖磁盘上的真实技能目录。
 * 本文件使用独立的临时 SQLite 目录（不依赖共享的 staff-e2e-env），避免与其它 staff e2e
 * 套件共用同一数据库导致的交叉污染。
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express, { type Router } from 'express';
import { createTestClient, type TestApiClient } from './utils/test-client.js';

// 本套件独占的临时数据库目录（必须在任何 server 模块导入前设置 CDF_DATA_DIR）
const MY_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-e2e-'));
process.env.CDF_DATA_DIR = MY_TMP;

// ---- 确定性注入主程序技能 ----
const FAKE_SKILLS = [
  {
    definition: {
      id: 'demo-echo',
      name: 'Demo Echo',
      description: '回声示例技能',
      group: 'util',
      source: 'builtin',
      native: false,
      parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    },
    state: 'active',
  },
  {
    definition: {
      id: 'native-runner',
      name: 'Native Runner',
      description: '原生可执行技能',
      group: 'system',
      source: 'user',
      native: true,
      parameters: { type: 'object', properties: {} },
    },
    state: 'enabled',
  },
];

vi.mock('../../server/engine/skillRegistry.js', () => ({
  skillRegistry: {
    getAllSkills: () => FAKE_SKILLS,
  },
}));

/** 与 server 响应信封对齐：{ code, data, message } */
interface StaffResp<T = unknown> {
  code: number;
  data: T;
  message?: string;
  implemented?: boolean;
}

const SYNC_TENANT = `pg-sync-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const GATE_TENANT = `pg-gate-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe('数字员工 × 程序 skill 联动', () => {
  let client: TestApiClient;
  let toolDao: typeof import('../../server/dao/staff/staffToolDao.js');
  let resolveStaffSkillPermissionConfig: typeof import('../../server/staff/staffSkillGating.js')['resolveStaffSkillPermissionConfig'];

  beforeAll(async () => {
    const programSkillsRouter = (await import('../../server/routes/staff/programSkills.js')).default;
    toolDao = await import('../../server/dao/staff/staffToolDao.js');
    resolveStaffSkillPermissionConfig = (
      await import('../../server/staff/staffSkillGating.js')
    ).resolveStaffSkillPermissionConfig;

    const staffRouter: Router = express.Router();
    staffRouter.use('/program-skills', programSkillsRouter);
    client = createTestClient(staffRouter, '/api/staffdeck');
  });

  afterAll(() => {
    try {
      fs.rmSync(MY_TMP, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('GET /program-skills 列出主程序已注册技能（含原生）', async () => {
    const res = await client.get('/program-skills');
    const body = res.body as StaffResp<Array<{ id: string; name: string; native: boolean; enabled: boolean }>>;
    expect(body.code).toBe(0);
    expect(body.implemented).toBe(true);
    const ids = body.data.map((s) => s.id);
    expect(ids).toContain('demo-echo');
    expect(ids).toContain('native-runner');
    const native = body.data.find((s) => s.id === 'native-runner');
    expect(native?.native).toBe(true);
    expect(native?.enabled).toBe(true);
  });

  it('POST /program-skills/sync 将技能 upsert 进 sd_tools（tool_type=skill）', async () => {
    const res = await client.post(`/program-skills/sync?tenant_id=${SYNC_TENANT}`);
    const body = res.body as StaffResp<{ imported: number; updated: number; total: number }>;
    expect(body.code).toBe(0);
    expect(body.data.implemented).toBe(true);
    expect(body.data.success).toBe(true);
    expect(body.data.total).toBe(2);
    expect(body.data.imported).toBe(2);

    // 断言已落库为 tool_type='skill'
    const rows = toolDao.listTools(SYNC_TENANT).filter((t) => t.tool_type === 'skill');
    expect(rows).toHaveLength(2);
    const echo = rows.find((t) => t.name === 'skill_demo-echo');
    expect(echo).toBeDefined();
    expect(echo?.method).toBe('skill');
    expect(echo?.config_json).toContain('demo-echo');
    expect(echo?.enabled).toBe(1);
  });

  it('POST /program-skills/sync 幂等（重复同步仅 updated）', async () => {
    const res = await client.post(`/program-skills/sync?tenant_id=${SYNC_TENANT}`);
    const body = res.body as StaffResp<{ imported: number; updated: number; total: number }>;
    expect(body.data.imported).toBe(0);
    expect(body.data.updated).toBe(2);
    expect(body.data.total).toBe(2);
  });

  it('resolveStaffSkillPermissionConfig：无程序技能工具 → 返回 undefined（不干预全局）', () => {
    const cfg = resolveStaffSkillPermissionConfig(GATE_TENANT);
    expect(cfg).toBeUndefined();
  });

  it('resolveStaffSkillPermissionConfig：仅已启用技能进入 allow', () => {
    toolDao.createTool({
      tenant_id: GATE_TENANT,
      name: 'skill_demo-echo',
      tool_type: 'skill',
      method: 'skill',
      url: '',
      config: { skillId: 'demo-echo' },
      enabled: true,
    });
    toolDao.createTool({
      tenant_id: GATE_TENANT,
      name: 'skill_native-runner',
      tool_type: 'skill',
      method: 'skill',
      url: '',
      config: { skillId: 'native-runner' },
      enabled: false,
    });

    const cfg = resolveStaffSkillPermissionConfig(GATE_TENANT);
    expect(cfg).not.toBeUndefined();
    expect(cfg?.allow).toEqual(['demo-echo']);
    expect(cfg?.deny).toEqual([]);
    expect(cfg?.elevated.enabled).toBe('ask');
  });

  it('resolveStaffSkillPermissionConfig：全部禁用 → allow 为空匹配（全拒）', () => {
    const rows = toolDao.listTools(GATE_TENANT).filter((t) => t.tool_type === 'skill');
    for (const r of rows) {
      toolDao.updateTool(GATE_TENANT, r.id, { enabled: false });
    }
    const cfg = resolveStaffSkillPermissionConfig(GATE_TENANT);
    expect(cfg?.allow).toHaveLength(1);
    expect(cfg?.allow[0]).toBe('__no_program_skill_enabled__');
  });
});
