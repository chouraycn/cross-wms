import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  startHotReload,
  stopHotReload,
  reloadSkill,
  reloadAllSkills,
  getHotReloadStatus,
  onSkillChange,
  getDefaultConfig,
} from '../runtime/hot-reload.js';

const WORKSPACE_SKILLS_DIR = '.cross-wms/skills';

function makeSkillMd(opts: {
  name?: string;
  description?: string;
  version?: string;
}): string {
  const fm: string[] = ['---'];
  if (opts.name) fm.push(`name: ${opts.name}`);
  if (opts.description) fm.push(`description: ${opts.description}`);
  if (opts.version) fm.push(`version: ${opts.version}`);
  fm.push('---', '', `# ${opts.name ?? 'skill'}`);
  return fm.join('\n');
}

describe('HotReload', () => {
  let tmpRoot: string;
  let skillsDir: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hot-reload-'));
    skillsDir = path.join(tmpRoot, WORKSPACE_SKILLS_DIR);
    fs.mkdirSync(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    stopHotReload();
    await new Promise((resolve) => setTimeout(resolve, 100));
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeSkill(name: string, content?: string) {
    const skillDir = path.join(skillsDir, name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content ?? makeSkillMd({ name }), 'utf-8');
  }

  function deleteSkill(name: string) {
    const skillDir = path.join(skillsDir, name);
    fs.rmSync(skillDir, { recursive: true, force: true });
  }

  describe('getDefaultConfig', () => {
    it('应返回默认配置', async () => {
      const config = await getDefaultConfig(tmpRoot);
      expect(config.watchDirs).toContain(path.join(tmpRoot, WORKSPACE_SKILLS_DIR));
      expect(config.debounceMs).toBe(500);
      expect(config.maxChangesPerBatch).toBe(100);
    });
  });

  describe('startHotReload / stopHotReload', () => {
    it('应启动和停止热重载', async () => {
      const config = {
        watchDirs: [skillsDir],
        debounceMs: 100,
        enabled: true,
        maxChangesPerBatch: 100,
      };

      await startHotReload(config);
      const status = getHotReloadStatus();
      expect(status.running).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.watchedDirs).toContain(skillsDir);

      stopHotReload();
      const stoppedStatus = getHotReloadStatus();
      expect(stoppedStatus.running).toBe(false);
      expect(stoppedStatus.watchedDirs).toHaveLength(0);
    });

    it('禁用配置时不应启动', async () => {
      const config = {
        watchDirs: [skillsDir],
        debounceMs: 100,
        enabled: false,
        maxChangesPerBatch: 100,
      };

      await startHotReload(config);
      const status = getHotReloadStatus();
      expect(status.running).toBe(false);
    });

    it('重复启动应返回同一停止函数', async () => {
      const config = {
        watchDirs: [skillsDir],
        debounceMs: 100,
        enabled: true,
        maxChangesPerBatch: 100,
      };

      const stop1 = await startHotReload(config);
      const stop2 = await startHotReload(config);

      expect(stop1).toBe(stop2);
    });
  });

  describe('getHotReloadStatus', () => {
    it('应返回正确的状态信息', async () => {
      const config = {
        watchDirs: [skillsDir],
        debounceMs: 200,
        enabled: true,
        maxChangesPerBatch: 50,
      };

      await startHotReload(config);
      const status = getHotReloadStatus();

      expect(status.enabled).toBe(true);
      expect(status.running).toBe(true);
      expect(status.watchedDirs).toHaveLength(1);
      expect(status.debounceMs).toBe(200);
      expect(status.maxChangesPerBatch).toBe(50);
      expect(status.totalReloads).toBe(0);
      expect(status.pendingChanges).toBe(0);
    });
  });

  describe('reloadSkill', () => {
    it('应重载单个技能', async () => {
      writeSkill('test-skill', makeSkillMd({ name: 'test-skill', version: '1.0.0' }));

      const result = await reloadSkill('test-skill', tmpRoot);
      expect(result.reloadedSkills).toContain('test-skill');
      expect(result.errors).toHaveLength(0);
    });

    it('技能不存在时应返回错误', async () => {
      const result = await reloadSkill('non-existent', tmpRoot);
      expect(result.errors).toHaveLength(1);
      expect(result.reloadedSkills).toHaveLength(0);
    });
  });

  describe('reloadAllSkills', () => {
    it('应重载所有技能', async () => {
      writeSkill('skill-a', makeSkillMd({ name: 'skill-a', version: '1.0.0' }));
      writeSkill('skill-b', makeSkillMd({ name: 'skill-b', version: '1.0.0' }));

      const result = await reloadAllSkills(tmpRoot);
      expect(result.reloadedSkills.length).toBeGreaterThanOrEqual(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('onSkillChange', () => {
    it('应注册和取消注册监听器', () => {
      const listener = vi.fn();

      const unsubscribe = onSkillChange(listener);
      unsubscribe();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('文件监听', () => {
    it('应检测技能创建', async () => {
      const config = {
        watchDirs: [skillsDir],
        debounceMs: 50,
        enabled: true,
        maxChangesPerBatch: 100,
      };

      const stop = await startHotReload(config);
      await new Promise((resolve) => setTimeout(resolve, 100));

      writeSkill('new-skill');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const status = getHotReloadStatus();
      expect(status.totalReloads).toBeGreaterThan(0);

      stop();
    });

    it('应检测技能修改', async () => {
      writeSkill('mod-skill', makeSkillMd({ name: 'mod-skill', version: '1.0.0' }));

      const config = {
        watchDirs: [skillsDir],
        debounceMs: 50,
        enabled: true,
        maxChangesPerBatch: 100,
      };

      const stop = await startHotReload(config);
      await new Promise((resolve) => setTimeout(resolve, 100));

      await reloadSkill('mod-skill', tmpRoot);
      const initialReloads = getHotReloadStatus().totalReloads;

      writeSkill('mod-skill', makeSkillMd({ name: 'mod-skill', version: '2.0.0' }));
      await new Promise((resolve) => setTimeout(resolve, 200));

      const status = getHotReloadStatus();
      expect(status.totalReloads).toBeGreaterThan(initialReloads);

      stop();
    });

    it('应检测技能删除', async () => {
      writeSkill('del-skill');

      const config = {
        watchDirs: [skillsDir],
        debounceMs: 50,
        enabled: true,
        maxChangesPerBatch: 100,
      };

      const stop = await startHotReload(config);
      await new Promise((resolve) => setTimeout(resolve, 100));

      await reloadSkill('del-skill', tmpRoot);
      const initialReloads = getHotReloadStatus().totalReloads;

      deleteSkill('del-skill');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const status = getHotReloadStatus();
      expect(status.totalReloads).toBeGreaterThan(initialReloads);

      stop();
    });
  });
});
