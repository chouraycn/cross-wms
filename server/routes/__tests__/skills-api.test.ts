/**
 * Skills API 集成测试
 *
 * 覆盖 /api/skills 相关端点：
 * - GET    /api/skills           — 列出所有技能
 * - GET    /api/skills/:id       — 获取技能详情
 * - POST   /api/skills           — 创建技能
 * - PUT    /api/skills/:id       — 更新技能
 * - DELETE /api/skills/:id       — 删除技能
 * - POST   /api/skills/:id/enable    — 启用技能
 * - POST   /api/skills/:id/disable   — 禁用技能
 * - GET    /api/skills/:id/versions  — 获取技能版本列表
 * - POST   /api/skills/:id/upgrade   — 升级技能
 * - POST   /api/skills/:id/rollback  — 回滚技能版本
 * - GET    /api/skills/:id/dependencies — 获取依赖列表
 * - POST   /api/skills/install       — 安装技能
 * - GET    /api/skills/search?q=     — 搜索技能
 * - GET    /api/skills/audit         — 技能安全审计
 * - GET    /api/skills/metrics       — 技能性能指标
 * - GET    /api/templates            — 获取模板列表
 * - POST   /api/templates/:id/create — 使用模板创建技能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockFns = vi.hoisted(() => ({
  getUserSkills: vi.fn(),
  getUserSkillById: vi.fn(),
  createUserSkill: vi.fn(),
  updateUserSkill: vi.fn(),
  deleteUserSkill: vi.fn(),
  getSkillUsageStats: vi.fn(),
}));

vi.mock('../../engine/skills/index.js', () => ({
  getUserSkills: mockFns.getUserSkills,
  getUserSkillById: mockFns.getUserSkillById,
  createUserSkill: mockFns.createUserSkill,
  updateUserSkill: mockFns.updateUserSkill,
  deleteUserSkill: mockFns.deleteUserSkill,
}));

vi.mock('../../dao/chat.js', () => ({
  getSkillUsageStats: mockFns.getSkillUsageStats,
}));

vi.mock('../../services/securityAuditor.js', () => ({
  auditSkillMd: vi.fn().mockResolvedValue({ score: 100, level: 'safe', issues: [] }),
  generateMarkdownReport: vi.fn().mockReturnValue('# Audit Report\n\nNo issues found.'),
}));

vi.mock('../../logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import skillsApiRouter from '../skills-api.js';

describe('Skills API', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/skills', skillsApiRouter);
  });

  const mockSkill = {
    id: 'skill-1',
    name: 'Test Skill',
    desc: 'Test Description',
    icon: 'Extension',
    category: 'tool',
    path: '/path/to/skill',
    trigger: null,
    detail: null,
    tags: 'tag1,tag2',
    status: 'active',
    version: '1.0.0',
    featured: 0,
    shortcut: null,
    installedAt: Date.now(),
    promptTemplate: '# Test Skill\n\nDescription',
    executionMode: null,
  };

  const mockSkills = [mockSkill];

  // ===================== GET /api/skills =====================
  describe('GET /api/skills', () => {
    it('返回技能列表', async () => {
      mockFns.getUserSkills.mockReturnValue(mockSkills);

      const res = await request(app).get('/api/skills');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockSkills);
    });

    it('数据库错误时返回 500', async () => {
      mockFns.getUserSkills.mockImplementation(() => {
        throw new Error('Database error');
      });

      const res = await request(app).get('/api/skills');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Database error');
    });
  });

  // ===================== GET /api/skills/:id =====================
  describe('GET /api/skills/:id', () => {
    it('返回技能详情', async () => {
      mockFns.getUserSkillById.mockReturnValue(mockSkill);

      const res = await request(app).get('/api/skills/skill-1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockSkill);
    });

    it('技能不存在时返回 404', async () => {
      mockFns.getUserSkillById.mockReturnValue(undefined);

      const res = await request(app).get('/api/skills/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('技能不存在');
    });
  });

  // ===================== POST /api/skills =====================
  describe('POST /api/skills', () => {
    it('创建技能成功', async () => {
      const newSkill = { ...mockSkill, id: 'skill-2' };
      mockFns.createUserSkill.mockReturnValue(newSkill);

      const res = await request(app).post('/api/skills').send({
        name: 'New Skill',
        desc: 'New Description',
        icon: 'Wrench',
        category: 'tool',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('技能创建成功');
      expect(mockFns.createUserSkill).toHaveBeenCalledWith({
        name: 'New Skill',
        desc: 'New Description',
        icon: 'Wrench',
        category: 'tool',
        path: '',
        trigger: undefined,
        detail: undefined,
        tags: undefined,
        version: undefined,
        promptTemplate: undefined,
        executionMode: undefined,
      });
    });

    it('名称为空时返回 400', async () => {
      const res = await request(app).post('/api/skills').send({
        desc: 'Description',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('技能名称不能为空');
    });
  });

  // ===================== PUT /api/skills/:id =====================
  describe('PUT /api/skills/:id', () => {
    it('更新技能成功', async () => {
      const updatedSkill = { ...mockSkill, name: 'Updated Skill' };
      mockFns.getUserSkillById.mockReturnValue(mockSkill);
      mockFns.updateUserSkill.mockReturnValue(updatedSkill);

      const res = await request(app).put('/api/skills/skill-1').send({
        name: 'Updated Skill',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('技能更新成功');
    });

    it('技能不存在时返回 404', async () => {
      mockFns.getUserSkillById.mockReturnValue(undefined);

      const res = await request(app).put('/api/skills/nonexistent').send({
        name: 'Updated',
      });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ===================== DELETE /api/skills/:id =====================
  describe('DELETE /api/skills/:id', () => {
    it('删除技能成功', async () => {
      mockFns.getUserSkillById.mockReturnValue(mockSkill);
      mockFns.deleteUserSkill.mockReturnValue(true);

      const res = await request(app).delete('/api/skills/skill-1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('技能删除成功');
    });

    it('技能不存在时返回 404', async () => {
      mockFns.getUserSkillById.mockReturnValue(undefined);

      const res = await request(app).delete('/api/skills/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  // ===================== POST /api/skills/:id/enable =====================
  describe('POST /api/skills/:id/enable', () => {
    it('启用技能成功', async () => {
      const disabledSkill = { ...mockSkill, status: 'available' };
      const enabledSkill = { ...mockSkill, status: 'active' };
      mockFns.getUserSkillById.mockReturnValue(disabledSkill);
      mockFns.updateUserSkill.mockReturnValue(enabledSkill);

      const res = await request(app).post('/api/skills/skill-1/enable');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('技能启用成功');
    });

    it('技能已启用时返回成功', async () => {
      mockFns.getUserSkillById.mockReturnValue(mockSkill);

      const res = await request(app).post('/api/skills/skill-1/enable');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('技能已启用');
    });
  });

  // ===================== POST /api/skills/:id/disable =====================
  describe('POST /api/skills/:id/disable', () => {
    it('禁用技能成功', async () => {
      const disabledSkill = { ...mockSkill, status: 'available' };
      mockFns.getUserSkillById.mockReturnValue(mockSkill);
      mockFns.updateUserSkill.mockReturnValue(disabledSkill);

      const res = await request(app).post('/api/skills/skill-1/disable');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('技能禁用成功');
    });

    it('技能已禁用时返回成功', async () => {
      const disabledSkill = { ...mockSkill, status: 'available' };
      mockFns.getUserSkillById.mockReturnValue(disabledSkill);

      const res = await request(app).post('/api/skills/skill-1/disable');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('技能已禁用');
    });
  });

  // ===================== GET /api/skills/:id/versions =====================
  describe('GET /api/skills/:id/versions', () => {
    it('返回版本列表', async () => {
      mockFns.getUserSkillById.mockReturnValue(mockSkill);

      const res = await request(app).get('/api/skills/skill-1/versions');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        current: '1.0.0',
        history: [],
      });
    });
  });

  // ===================== POST /api/skills/:id/upgrade =====================
  describe('POST /api/skills/:id/upgrade', () => {
    it('升级技能成功', async () => {
      const upgradedSkill = { ...mockSkill, version: '2.0.0' };
      mockFns.getUserSkillById.mockReturnValue(mockSkill);
      mockFns.updateUserSkill.mockReturnValue(upgradedSkill);

      const res = await request(app).post('/api/skills/skill-1/upgrade').send({
        targetVersion: '2.0.0',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('技能已升级到 2.0.0');
    });

    it('缺少目标版本时返回 400', async () => {
      mockFns.getUserSkillById.mockReturnValue(mockSkill);

      const res = await request(app).post('/api/skills/skill-1/upgrade').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('目标版本不能为空');
    });
  });

  // ===================== POST /api/skills/:id/rollback =====================
  describe('POST /api/skills/:id/rollback', () => {
    it('回滚技能成功', async () => {
      const rolledBackSkill = { ...mockSkill, version: '0.9.0' };
      mockFns.getUserSkillById.mockReturnValue(mockSkill);
      mockFns.updateUserSkill.mockReturnValue(rolledBackSkill);

      const res = await request(app).post('/api/skills/skill-1/rollback').send({
        targetVersion: '0.9.0',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('技能已回滚到 0.9.0');
    });
  });

  // ===================== GET /api/skills/:id/dependencies =====================
  describe('GET /api/skills/:id/dependencies', () => {
    it('返回依赖列表', async () => {
      mockFns.getUserSkillById.mockReturnValue(mockSkill);

      const res = await request(app).get('/api/skills/skill-1/dependencies');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        bins: [],
        env: [],
        config: [],
        skills: [],
      });
    });
  });

  // ===================== POST /api/skills/install =====================
  describe('POST /api/skills/install', () => {
    it('安装技能成功', async () => {
      const res = await request(app).post('/api/skills/install').send({
        source: 'clawhub',
        url: 'https://clawhub.example.com/skill',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('技能安装成功');
    });

    it('无效安装源返回 400', async () => {
      const res = await request(app).post('/api/skills/install').send({
        source: 'invalid',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('无效的安装源类型');
    });
  });

  // ===================== GET /api/skills/search =====================
  describe('GET /api/skills/search', () => {
    it('搜索技能成功', async () => {
      mockFns.getUserSkills.mockReturnValue(mockSkills);

      const res = await request(app).get('/api/skills/search?q=Test');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('缺少搜索关键词返回 400', async () => {
      const res = await request(app).get('/api/skills/search');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('搜索关键词不能为空');
    });
  });

  // ===================== GET /api/skills/audit =====================
  describe('GET /api/skills/audit', () => {
    it('返回审计结果', async () => {
      mockFns.getUserSkills.mockReturnValue(mockSkills);

      const res = await request(app).get('/api/skills/audit');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  // ===================== GET /api/skills/metrics =====================
  describe('GET /api/skills/metrics', () => {
    it('返回性能指标', async () => {
      mockFns.getUserSkills.mockReturnValue(mockSkills);
      mockFns.getSkillUsageStats.mockReturnValue({ total: 100 });

      const res = await request(app).get('/api/skills/metrics');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalCount).toBe(1);
      expect(res.body.data.activeCount).toBe(1);
    });
  });

  // ===================== GET /api/templates =====================
  describe('GET /api/templates', () => {
    it('返回模板列表', async () => {
      const res = await request(app).get('/api/skills/templates');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(4);
    });
  });

  // ===================== POST /api/templates/:id/create =====================
  describe('POST /api/templates/:id/create', () => {
    it('使用模板创建技能成功', async () => {
      const newSkill = { ...mockSkill, id: 'skill-3', icon: 'Wrench', category: 'tool' };
      mockFns.createUserSkill.mockReturnValue(newSkill);

      const res = await request(app).post('/api/skills/templates/template-basic/create').send({
        name: 'New Skill from Template',
        desc: 'Created from template',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('模板不存在时返回 404', async () => {
      const res = await request(app).post('/api/skills/templates/nonexistent/create').send({
        name: 'Test',
      });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('模板不存在');
    });
  });
});
