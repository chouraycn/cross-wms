/**
 * StaffDeck 通用技能导入端点集成测试（Round3 接真）
 *
 * 覆盖 `/import-skillhub` 与 `/import-package` 的真实创建能力：
 *  - import-skillhub：内联 markdown 来源 → 解析标题/内容 → 创建 draft 通用技能。
 *  - import-package：包结构（files / skill_markdown）→ 创建 draft 并写入 skill_files。
 *  - 边界：空 source → 400；重复 slug → 409。
 *
 * 网络抓取（URL 来源）不在本套件覆盖（离线、非确定性），仅覆盖内联来源。
 * 隔离：通过 ./utils/staff-e2e-env.js 将 SQLite 重定向到临时目录；每 describe 用唯一 tenant。
 */

// 必须首先导入，确保 server/db-core 加载前 CDF_DATA_DIR 已指向临时目录
import './utils/staff-e2e-env.js';

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import express from 'express';
import request from 'supertest';
import generalSkillsRouter from '../../server/routes/staff/generalSkills.js';
import { STAFF_E2E_TMP_DIR } from './utils/staff-e2e-env.js';

function uniqueTenant(): string {
  return `e2e-import-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

afterAll(() => {
  try {
    fs.rmSync(STAFF_E2E_TMP_DIR, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

describe('通用技能导入端点接真（Round3）', () => {
  const tenant = uniqueTenant();
  const app = express();
  app.use(express.json());
  app.use('/', generalSkillsRouter);

  it('import-skillhub：内联 markdown 来源创建 draft 技能', async () => {
    const source = '# 退款政策助手\n\n当用户咨询退款时，先核对订单状态再处理。';
    const res = await request(app)
      .post('/import-skillhub')
      .send({ tenant_id: tenant, source });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe(0);
    expect(res.body.data?.implemented).toBe(true);
    expect(res.body.data?.imported).toBe(true);
    const skill = res.body.data?.skill;
    expect(skill).toBeTruthy();
    expect(skill.name).toBe('退款政策助手');
    expect(skill.slug).toBe('退款政策助手');
    expect(skill.skill_markdown).toContain('核对订单状态');
    expect(skill.status).toBe('draft');
    expect(skill.metadata?.imported_from).toBe('inline');
  });

  it('import-skillhub：空 source 返回 400', async () => {
    const res = await request(app).post('/import-skillhub').send({ tenant_id: tenant, source: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(400);
  });

  it('import-skillhub：重复 slug 返回 409', async () => {
    const source = '# 重复技能\n\n内容。';
    const first = await request(app).post('/import-skillhub').send({ tenant_id: tenant, source });
    expect(first.status).toBe(201);
    const dup = await request(app).post('/import-skillhub').send({ tenant_id: tenant, source });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe(409);
  });

  it('import-package：包结构创建 draft 并写入 skill_files', async () => {
    const res = await request(app)
      .post('/import-package')
      .send({
        tenant_id: tenant,
        name: '包导入技能',
        skill_files: [{ path: 'README.md', content: '这是一个包导入的技能说明。' }],
      });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe(0);
    expect(res.body.data?.imported).toBe(true);
    const skill = res.body.data?.skill;
    expect(skill).toBeTruthy();
    expect(skill.name).toBe('包导入技能');
    expect(skill.skill_files).toHaveLength(1);
    expect(skill.skill_files[0].path).toBe('README.md');
    expect(skill.skill_markdown).toContain('包导入的技能说明');
    expect(skill.metadata?.imported_from).toBe('package');
  });

  it('import-package：既无 markdown 也无 files 返回 400', async () => {
    const res = await request(app).post('/import-package').send({ tenant_id: tenant, name: '空包' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(400);
  });
});
