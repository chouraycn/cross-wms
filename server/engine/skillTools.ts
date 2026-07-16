/**
 * Skill Tools — 技能创建与管理工具
 *
 * 提供 AI 可直接调用的技能创建工具，支持提案创建与自动应用。
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../logger.js';
import { skillWorkshop } from './skillWorkshop.js';
import { AppPaths, ensureDir } from '../config/appPaths.js';
import { reloadSkills } from './skillLifecycle.js';

function resolveSkillPath(skillName: string): string {
  const skillsDir = AppPaths.skillsDir;
  return path.join(skillsDir, skillName, 'SKILL.md');
}

function writeSkillFile(skillPath: string, content: string): void {
  const dir = path.dirname(skillPath);
  ensureDir(dir);
  fs.writeFileSync(skillPath, content, 'utf-8');
}

export async function handleSkillCreateProposal(args: Record<string, unknown>): Promise<string> {
  try {
    const skillName = String(args.skillName || '').trim();
    const description = String(args.description || '').trim();
    const content = String(args.content || '').trim();
    const autoApply = args.autoApply === true || args.autoApply === 'true';

    if (!skillName) {
      return JSON.stringify({ success: false, error: '技能名称不能为空' });
    }

    if (!content) {
      return JSON.stringify({ success: false, error: 'SKILL.md 内容不能为空' });
    }

    const skillPath = resolveSkillPath(skillName);

    let type: 'create' | 'update' = 'create';
    let previousContent: string | undefined;
    let currentContentHash: string | undefined;

    if (fs.existsSync(skillPath)) {
      type = 'update';
      previousContent = fs.readFileSync(skillPath, 'utf-8');
      currentContentHash = crypto
        .createHash('sha256')
        .update(previousContent)
        .digest('hex')
        .slice(0, 16);
    }

    const proposal = skillWorkshop.createProposal({
      type,
      skillName,
      skillPath,
      content,
      previousContent,
      currentContentHash,
    });

    if (proposal.status === 'quarantined') {
      return JSON.stringify({
        success: false,
        error: '提案因安全风险被隔离，请人工审核后再应用',
        proposal: {
          id: proposal.id,
          status: proposal.status,
          scan: proposal.scan,
        },
      });
    }

    if (autoApply) {
      try {
        const applied = skillWorkshop.applyProposal(proposal.id);
        writeSkillFile(skillPath, content);
        try {
          const reloaded = await reloadSkills();
          logger.info(`[SkillTools] 技能 '${skillName}' 已应用并热刷新，重新加载 ${reloaded.loaded} 个技能`);
        } catch (reloadErr) {
          logger.warn(`[SkillTools] 技能 '${skillName}' 已应用，但热刷新失败：${reloadErr instanceof Error ? reloadErr.message : String(reloadErr)}`);
        }
        logger.info(`[SkillTools] Skill '${skillName}' created and applied successfully at ${skillPath}`);
        return JSON.stringify({
          success: true,
          action: 'create_and_apply',
          proposal: {
            id: applied.id,
            status: applied.status,
            skillName: applied.skillName,
            skillPath: applied.skillPath,
          },
          description,
        });
      } catch (applyErr) {
        return JSON.stringify({
          success: false,
          error: `提案创建成功但应用失败：${applyErr instanceof Error ? applyErr.message : String(applyErr)}`,
          proposal: {
            id: proposal.id,
            status: proposal.status,
          },
        });
      }
    }

    return JSON.stringify({
      success: true,
      action: 'create_proposal',
      proposal: {
        id: proposal.id,
        status: proposal.status,
        skillName: proposal.skillName,
        skillPath: proposal.skillPath,
        type: proposal.type,
      },
      description,
      message: '提案已创建，等待审批',
    });
  } catch (err) {
    logger.error('[SkillTools] handleSkillCreateProposal error:', err);
    return JSON.stringify({
      success: false,
      error: `创建技能提案失败：${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

export const skillTools = {
  handleSkillCreateProposal,
};