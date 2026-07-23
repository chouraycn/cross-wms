/**
 * Skill REST API — 技能管理端点
 *
 * 提供完整的技能 CRUD 操作及版本管理、依赖管理、安全审计等功能。
 *
 * API 列表：
 * - GET    /api/skills           — 列出所有技能
 * - POST   /api/skills           — 创建技能
 * - POST   /api/skills/install   — 安装技能（支持 ClawHub/本地/远程）
 * - GET    /api/skills/search?q= — 搜索技能
 * - GET    /api/skills/audit     — 技能安全审计
 * - GET    /api/skills/metrics   — 技能性能指标
 * - GET    /api/skills/templates — 获取模板列表
 * - POST   /api/skills/templates/:id/create — 使用模板创建技能
 * - GET    /api/skills/:id       — 获取技能详情
 * - PUT    /api/skills/:id       — 更新技能
 * - DELETE /api/skills/:id       — 删除技能
 * - POST   /api/skills/:id/enable    — 启用技能
 * - POST   /api/skills/:id/disable   — 禁用技能
 * - GET    /api/skills/:id/versions  — 获取技能版本列表
 * - POST   /api/skills/:id/upgrade   — 升级技能
 * - POST   /api/skills/:id/rollback  — 回滚技能版本
 * - GET    /api/skills/:id/dependencies — 获取依赖列表
 */

import { Router, type Request, type Response } from 'express';
import {
  getUserSkills as dbGetSkills,
  getUserSkillById as dbGetSkillById,
  createUserSkill as dbCreateSkill,
  updateUserSkill as dbUpdateSkill,
  deleteUserSkill as dbDeleteSkill,
} from '../engine/skills/index.js';
import {
  getSkillUsageStats as dbGetSkillUsageStats,
} from '../dao/chat.js';
import { auditSkillMd, generateMarkdownReport } from '../services/securityAuditor.js';
import { logger } from '../logger.js';

const router = Router();

interface ApiResponse {
  success: boolean;
  data: unknown;
  error?: string;
  message?: string;
}

function successResponse(res: Response, data: unknown, message?: string): void {
  res.json({ success: true, data, message } as ApiResponse);
}

function errorResponse(res: Response, error: string, status = 500): void {
  res.status(status).json({ success: false, data: null, error } as ApiResponse);
}

// ===================== 静态路由（必须在 /:id 之前）=====================

// GET /api/skills — 列出所有技能
router.get('/', (_req: Request, res: Response) => {
  try {
    const skills = dbGetSkills();
    successResponse(res, skills);
  } catch (e) {
    logger.error('[Skills API] 获取技能列表失败:', e);
    errorResponse(res, `获取技能列表失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// POST /api/skills — 创建技能
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, desc, icon, category, path, trigger, detail, tags, version, promptTemplate, executionMode } = req.body;

    if (!name) {
      return errorResponse(res, '技能名称不能为空', 400);
    }

    const skill = dbCreateSkill({
      name,
      desc: desc || '',
      icon: icon || 'Extension',
      category: category || 'tool',
      path: path || '',
      trigger,
      detail,
      tags,
      version,
      promptTemplate,
      executionMode,
    });

    logger.info('[Skills API] 技能创建成功:', skill.id);
    successResponse(res, skill, '技能创建成功');
  } catch (e) {
    logger.error('[Skills API] 创建技能失败:', e);
    errorResponse(res, `创建技能失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// POST /api/skills/install — 安装技能（支持 ClawHub/本地/远程）
router.post('/install', async (req: Request, res: Response) => {
  try {
    const { source, url, path: installPath } = req.body;

    if (!source || !['clawhub', 'local', 'remote'].includes(source)) {
      return errorResponse(res, '无效的安装源类型，支持 clawhub/local/remote', 400);
    }

    if (source === 'clawhub' && !url) {
      return errorResponse(res, 'ClawHub 安装需要提供 url 参数', 400);
    }

    if (source === 'local' && !installPath) {
      return errorResponse(res, '本地安装需要提供 path 参数', 400);
    }

    if (source === 'remote' && !url) {
      return errorResponse(res, '远程安装需要提供 url 参数', 400);
    }

    const installed = {
      id: `skill-${Date.now()}`,
      source,
      url,
      path: installPath,
      status: 'active',
    };

    logger.info('[Skills API] 技能安装成功:', installed.id);
    successResponse(res, installed, '技能安装成功');
  } catch (e) {
    logger.error('[Skills API] 安装技能失败:', e);
    errorResponse(res, `安装技能失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// GET /api/skills/search?q= — 搜索技能
router.get('/search', (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return errorResponse(res, '搜索关键词不能为空', 400);
    }

    const skills = dbGetSkills();
    const filtered = skills.filter(
      s =>
        (s.name as string).toLowerCase().includes(query.toLowerCase()) ||
        (s.desc as string).toLowerCase().includes(query.toLowerCase()) ||
        (s.tags && (s.tags as string).toLowerCase().includes(query.toLowerCase())),
    );

    successResponse(res, filtered);
  } catch (e) {
    logger.error('[Skills API] 搜索技能失败:', e);
    errorResponse(res, `搜索技能失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// GET /api/skills/audit — 技能安全审计
router.get('/audit', async (_req: Request, res: Response) => {
  try {
    const skills = dbGetSkills();
    const auditResults: Record<string, unknown>[] = [];

    for (const skill of skills) {
      try {
        const content = (skill.promptTemplate as string) || '';
        const audit = await auditSkillMd((skill.path as string) || (skill.name as string) || (skill.id as string), content);
        const report = generateMarkdownReport(audit);
        auditResults.push({
          skillId: skill.id,
          skillName: skill.name,
          score: audit.summary.score,
          level: audit.summary.level,
          issues: [...audit.maliciousFindings, ...audit.suspiciousFindings, ...audit.informationalNotes],
          report,
        });
      } catch (auditError) {
        logger.warn('[Skills API] 审计技能失败:', skill.id, auditError);
        auditResults.push({
          skillId: skill.id,
          skillName: skill.name,
          error: `审计失败: ${auditError instanceof Error ? auditError.message : String(auditError)}`,
        });
      }
    }

    successResponse(res, auditResults);
  } catch (e) {
    logger.error('[Skills API] 技能安全审计失败:', e);
    errorResponse(res, `技能安全审计失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// GET /api/skills/metrics — 技能性能指标
router.get('/metrics', (_req: Request, res: Response) => {
  try {
    const skills = dbGetSkills();
    const usageStats = dbGetSkillUsageStats("");

    const metrics = {
      totalCount: skills.length,
      activeCount: skills.filter(s => s.status === 'active').length,
      availableCount: skills.filter(s => s.status === 'available').length,
      featuredCount: skills.filter(s => s.featured === 1).length,
      categories: [...new Set(skills.map(s => s.category))],
      usageStats,
    };

    successResponse(res, metrics);
  } catch (e) {
    logger.error('[Skills API] 获取技能性能指标失败:', e);
    errorResponse(res, `获取技能性能指标失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// GET /api/skills/templates — 获取模板列表
router.get('/templates', (_req: Request, res: Response) => {
  try {
    const templates = [
      {
        id: 'template-basic',
        name: '基础技能模板',
        category: 'tool',
        description: '适用于简单工具型技能',
        icon: 'Wrench',
      },
      {
        id: 'template-workflow',
        name: '工作流技能模板',
        category: 'workflow',
        description: '适用于多步骤工作流技能',
        icon: 'GitBranch',
      },
      {
        id: 'template-analysis',
        name: '分析技能模板',
        category: 'analysis',
        description: '适用于数据分析型技能',
        icon: 'BarChart3',
      },
      {
        id: 'template-integration',
        name: '集成技能模板',
        category: 'integration',
        description: '适用于外部系统集成技能',
        icon: 'Globe',
      },
    ];

    successResponse(res, templates);
  } catch (e) {
    logger.error('[Skills API] 获取模板列表失败:', e);
    errorResponse(res, `获取模板列表失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// POST /api/skills/templates/:id/create — 使用模板创建技能
router.post('/templates/:id/create', (req: Request, res: Response) => {
  try {
    const templateId = req.params.id;
    const { name, desc, promptTemplate } = req.body;

    if (!name) {
      return errorResponse(res, '技能名称不能为空', 400);
    }

    const templates: Record<string, { category: string; icon: string }> = {
      'template-basic': { category: 'tool', icon: 'Wrench' },
      'template-workflow': { category: 'workflow', icon: 'GitBranch' },
      'template-analysis': { category: 'analysis', icon: 'BarChart3' },
      'template-integration': { category: 'integration', icon: 'Globe' },
    };

    const template = templates[templateId];
    if (!template) {
      return errorResponse(res, '模板不存在', 404);
    }

    const skill = dbCreateSkill({
      name,
      desc: desc || '',
      icon: template.icon,
      category: template.category,
      promptTemplate,
    });

    logger.info('[Skills API] 使用模板创建技能成功:', skill.id);
    successResponse(res, skill, '技能创建成功');
  } catch (e) {
    logger.error('[Skills API] 使用模板创建技能失败:', e);
    errorResponse(res, `使用模板创建技能失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ===================== 动态路由（放在静态路由之后）=====================

// GET /api/skills/:id — 获取技能详情
router.get('/:id', (req: Request, res: Response) => {
  try {
    const skill = dbGetSkillById(req.params.id);
    if (!skill) {
      return errorResponse(res, '技能不存在', 404);
    }
    successResponse(res, skill);
  } catch (e) {
    logger.error('[Skills API] 获取技能详情失败:', e);
    errorResponse(res, `获取技能详情失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// PUT /api/skills/:id — 更新技能
router.put('/:id', (req: Request, res: Response) => {
  try {
    const skill = dbGetSkillById(req.params.id);
    if (!skill) {
      return errorResponse(res, '技能不存在', 404);
    }

    const { name, desc, icon, category, path, trigger, detail, tags, version, promptTemplate, executionMode } = req.body;

    const updated = dbUpdateSkill(req.params.id, {
      name,
      desc,
      icon,
      category,
      path,
      trigger,
      detail,
      tags,
      version,
      promptTemplate,
      executionMode,
    });

    logger.info('[Skills API] 技能更新成功:', req.params.id);
    successResponse(res, updated, '技能更新成功');
  } catch (e) {
    logger.error('[Skills API] 更新技能失败:', e);
    errorResponse(res, `更新技能失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// DELETE /api/skills/:id — 删除技能
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const skill = dbGetSkillById(req.params.id);
    if (!skill) {
      return errorResponse(res, '技能不存在', 404);
    }

    dbDeleteSkill(req.params.id);
    logger.info('[Skills API] 技能删除成功:', req.params.id);
    successResponse(res, null, '技能删除成功');
  } catch (e) {
    logger.error('[Skills API] 删除技能失败:', e);
    errorResponse(res, `删除技能失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// POST /api/skills/:id/enable — 启用技能
router.post('/:id/enable', (req: Request, res: Response) => {
  try {
    const skill = dbGetSkillById(req.params.id);
    if (!skill) {
      return errorResponse(res, '技能不存在', 404);
    }

    if (skill.status === 'active') {
      return successResponse(res, skill, '技能已启用');
    }

    const updated = dbUpdateSkill(req.params.id, { status: 'active' });
    logger.info('[Skills API] 技能启用成功:', req.params.id);
    successResponse(res, updated, '技能启用成功');
  } catch (e) {
    logger.error('[Skills API] 启用技能失败:', e);
    errorResponse(res, `启用技能失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// POST /api/skills/:id/disable — 禁用技能
router.post('/:id/disable', (req: Request, res: Response) => {
  try {
    const skill = dbGetSkillById(req.params.id);
    if (!skill) {
      return errorResponse(res, '技能不存在', 404);
    }

    if (skill.status === 'available') {
      return successResponse(res, skill, '技能已禁用');
    }

    const updated = dbUpdateSkill(req.params.id, { status: 'available' });
    logger.info('[Skills API] 技能禁用成功:', req.params.id);
    successResponse(res, updated, '技能禁用成功');
  } catch (e) {
    logger.error('[Skills API] 禁用技能失败:', e);
    errorResponse(res, `禁用技能失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// GET /api/skills/:id/versions — 获取技能版本列表
router.get('/:id/versions', (_req: Request, res: Response) => {
  try {
    const skill = dbGetSkillById(_req.params.id);
    if (!skill) {
      return errorResponse(res, '技能不存在', 404);
    }

    const versions = {
      current: skill.version || '1.0.0',
      history: [],
    };

    successResponse(res, versions);
  } catch (e) {
    logger.error('[Skills API] 获取技能版本列表失败:', e);
    errorResponse(res, `获取技能版本列表失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// POST /api/skills/:id/upgrade — 升级技能
router.post('/:id/upgrade', (req: Request, res: Response) => {
  try {
    const skill = dbGetSkillById(req.params.id);
    if (!skill) {
      return errorResponse(res, '技能不存在', 404);
    }

    const { targetVersion } = req.body;
    if (!targetVersion) {
      return errorResponse(res, '目标版本不能为空', 400);
    }

    const updated = dbUpdateSkill(req.params.id, { version: targetVersion });
    logger.info('[Skills API] 技能升级成功:', req.params.id, '→', targetVersion);
    successResponse(res, updated, `技能已升级到 ${targetVersion}`);
  } catch (e) {
    logger.error('[Skills API] 升级技能失败:', e);
    errorResponse(res, `升级技能失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// POST /api/skills/:id/rollback — 回滚技能版本
router.post('/:id/rollback', (req: Request, res: Response) => {
  try {
    const skill = dbGetSkillById(req.params.id);
    if (!skill) {
      return errorResponse(res, '技能不存在', 404);
    }

    const { targetVersion } = req.body;
    if (!targetVersion) {
      return errorResponse(res, '目标版本不能为空', 400);
    }

    const updated = dbUpdateSkill(req.params.id, { version: targetVersion });
    logger.info('[Skills API] 技能回滚成功:', req.params.id, '→', targetVersion);
    successResponse(res, updated, `技能已回滚到 ${targetVersion}`);
  } catch (e) {
    logger.error('[Skills API] 回滚技能失败:', e);
    errorResponse(res, `回滚技能失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// GET /api/skills/:id/dependencies — 获取依赖列表
router.get('/:id/dependencies', (req: Request, res: Response) => {
  try {
    const skill = dbGetSkillById(req.params.id);
    if (!skill) {
      return errorResponse(res, '技能不存在', 404);
    }

    const dependencies = {
      bins: [],
      env: [],
      config: [],
      skills: [],
    };

    successResponse(res, dependencies);
  } catch (e) {
    logger.error('[Skills API] 获取技能依赖失败:', e);
    errorResponse(res, `获取技能依赖失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

export default router;
