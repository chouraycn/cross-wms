import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SkillLoader } from '../skill-loader.js';
import type { SkillEntry } from '../types.js';

function makeSkillMd(opts: {
  name?: string;
  description?: string;
  tags?: string;
  version?: string;
  disableModelInvocation?: boolean;
  body?: string;
}): string {
  const fm: string[] = ['---'];
  if (opts.name) fm.push(`name: ${opts.name}`);
  if (opts.description) fm.push(`description: ${opts.description}`);
  if (opts.tags) fm.push(`tags: ${opts.tags}`);
  if (opts.version) fm.push(`version: ${opts.version}`);
  if (opts.disableModelInvocation) fm.push('disable-model-invocation: true');
  fm.push('---', '');
  fm.push(opts.body ?? `# ${opts.name ?? 'skill'}\n\n描述`);
  return fm.join('\n');
}

describe('SkillLoader', () => {
  let tmpRoot: string;
  let bundledDir: string;
  let workspaceDir: string;
  let pluginDir: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-loader-'));
    bundledDir = path.join(tmpRoot, 'bundled');
    workspaceDir = path.join(tmpRoot, 'workspace');
    pluginDir = path.join(tmpRoot, 'plugins');
    fs.mkdirSync(bundledDir, { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(pluginDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeSkill(parentDir: string, name: string, content: string) {
    const skillDir = path.join(parentDir, name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
  }

  describe('loadAll / loadSkill', () => {
    it('应该从多个来源加载技能', async () => {
      writeSkill(
        bundledDir,
        'skill-a',
        makeSkillMd({ name: 'skill-a', description: 'A 描述', tags: 'wms,basic', version: '1.0.0' }),
      );
      writeSkill(
        workspaceDir,
        'skill-b',
        makeSkillMd({ name: 'skill-b', description: 'B 描述', tags: 'wms' }),
      );
      writeSkill(
        pluginDir,
        'skill-c',
        makeSkillMd({ name: 'skill-c', description: 'C 描述' }),
      );

      const loader = new SkillLoader({
        bundledSkillsDir: bundledDir,
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });
      const result = await loader.loadAll();

      expect(result.loadedCount).toBe(3);
      expect(result.skills.map((s) => s.skill.name).sort()).toEqual(['skill-a', 'skill-b', 'skill-c']);
    });

    it('plugin 来源应映射为 SkillSource="unknown"', async () => {
      writeSkill(pluginDir, 'skill-p', makeSkillMd({ name: 'skill-p' }));

      const loader = new SkillLoader({
        bundledSkillsDir: bundledDir,
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });
      const result = await loader.loadAll();

      expect(result.loadedCount).toBe(1);
      expect(result.skills[0].skill.source).toBe('unknown');
    });

    it('bundled 来源应映射为 SkillSource="bundled"', async () => {
      writeSkill(bundledDir, 'skill-b', makeSkillMd({ name: 'skill-b' }));

      const loader = new SkillLoader({
        bundledSkillsDir: bundledDir,
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });
      const result = await loader.loadAll({ sources: ['bundled'] });

      expect(result.skills[0].skill.source).toBe('bundled');
    });

    it('应解析 frontmatter 字段', async () => {
      writeSkill(
        bundledDir,
        'skill-x',
        makeSkillMd({
          name: 'skill-x',
          description: '描述 X',
          tags: 'wms,advance',
          version: '2.0.0',
        }),
      );

      const loader = new SkillLoader({
        bundledSkillsDir: bundledDir,
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });
      const result = await loader.loadAll({ sources: ['bundled'] });

      const entry = result.skills[0];
      expect(entry.frontmatter.name).toBe('skill-x');
      expect(entry.frontmatter.tags).toBe('wms,advance');
      expect(entry.frontmatter.version).toBe('2.0.0');
      expect(entry.skill.disableModelInvocation).toBe(false);
    });

    it('应正确处理 disable-model-invocation 标记', async () => {
      writeSkill(
        bundledDir,
        'disabled-skill',
        makeSkillMd({ name: 'disabled-skill', disableModelInvocation: true }),
      );
      writeSkill(
        bundledDir,
        'enabled-skill',
        makeSkillMd({ name: 'enabled-skill' }),
      );

      const loader = new SkillLoader({
        bundledSkillsDir: bundledDir,
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });

      const result = await loader.loadAll({ sources: ['bundled'] });
      expect(result.loadedCount).toBe(1);
      expect(result.skills[0].skill.name).toBe('enabled-skill');
      expect(result.skippedCount).toBe(1);

      // includeDisabled=true 时应加载被禁用的技能
      await loader.clear();
      const resultAll = await loader.loadAll({ sources: ['bundled'], includeDisabled: true });
      expect(resultAll.loadedCount).toBe(2);
    });

    it('应使用 SKILL.md 的目录名作为默认名称', async () => {
      // 没有 frontmatter.name 时回退到目录名
      const skillDir = path.join(bundledDir, 'fallback-name');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\ndescription: 没有名字\n---\n\n# 内容',
        'utf-8',
      );

      const loader = new SkillLoader({
        bundledSkillsDir: bundledDir,
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });
      const result = await loader.loadAll({ sources: ['bundled'] });
      expect(result.skills[0].skill.name).toBe('fallback-name');
    });

    it('maxSkills 应限制加载数量', async () => {
      for (let i = 0; i < 5; i++) {
        writeSkill(bundledDir, `skill-${i}`, makeSkillMd({ name: `skill-${i}` }));
      }
      const loader = new SkillLoader({
        bundledSkillsDir: bundledDir,
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });
      const result = await loader.loadAll({ sources: ['bundled'], maxSkills: 2 });
      expect(result.loadedCount).toBe(2);
      expect(result.skippedCount).toBe(3);
    });

    it('应跳过不存在的目录', async () => {
      const loader = new SkillLoader({
        bundledSkillsDir: '/non/existent/path',
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });
      const result = await loader.loadAll();
      expect(result.loadedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('应跳过没有 SKILL.md 的目录', async () => {
      fs.mkdirSync(path.join(bundledDir, 'empty-dir'), { recursive: true });
      writeSkill(bundledDir, 'real-skill', makeSkillMd({ name: 'real-skill' }));

      const loader = new SkillLoader({
        bundledSkillsDir: bundledDir,
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });
      const result = await loader.loadAll({ sources: ['bundled'] });
      expect(result.loadedCount).toBe(1);
      expect(result.skills[0].skill.name).toBe('real-skill');
    });

    it('应跳过非目录文件', async () => {
      fs.writeFileSync(path.join(bundledDir, 'README.md'), 'not a skill', 'utf-8');
      writeSkill(bundledDir, 'real-skill', makeSkillMd({ name: 'real-skill' }));

      const loader = new SkillLoader({
        bundledSkillsDir: bundledDir,
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });
      const result = await loader.loadAll({ sources: ['bundled'] });
      expect(result.loadedCount).toBe(1);
    });

    it('跨来源同名技能应分别加载（key 由 source+name 组成）', async () => {
      // 不同来源下同名的技能 key 不同，应都被加载
      writeSkill(bundledDir, 'dup', makeSkillMd({ name: 'dup' }));
      writeSkill(workspaceDir, 'dup', makeSkillMd({ name: 'dup' }));

      const loader = new SkillLoader({
        bundledSkillsDir: bundledDir,
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });
      const result = await loader.loadAll();
      expect(result.loadedCount).toBe(2);
      expect(result.skippedCount).toBe(0);
      // 来源应正确标注
      const bySource = {
        bundled: result.skills.filter((s) => s.skill.source === 'bundled').length,
        workspace: result.skills.filter((s) => s.skill.source === 'workspace').length,
      };
      expect(bySource.bundled).toBe(1);
      expect(bySource.workspace).toBe(1);
    });

    it('同来源重复加载（refresh 后再次 loadAll）应去重', async () => {
      // 通过先 loadAll 后再不 clear 直接 loadAll，验证内部缓存的去重
      writeSkill(bundledDir, 'dup-a', makeSkillMd({ name: 'dup-a' }));
      const loader = new SkillLoader({
        bundledSkillsDir: bundledDir,
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });
      const r1 = await loader.loadAll({ sources: ['bundled'] });
      expect(r1.loadedCount).toBe(1);
      // 不 clear 的情况下再次 loadAll：内部已存在的 key 应被跳过
      const r2 = await loader.loadAll({ sources: ['bundled'] });
      expect(r2.loadedCount).toBe(0);
      expect(r2.skippedCount).toBe(1);
    });
  });

  describe('查询方法', () => {
    let loader: SkillLoader;
    let skills: SkillEntry[];

    beforeEach(async () => {
      writeSkill(
        bundledDir,
        'wms-core',
        makeSkillMd({ name: 'wms-core', description: 'core', tags: 'wms,basic', version: '1.0.0' }),
      );
      writeSkill(
        workspaceDir,
        'wms-ext',
        makeSkillMd({ name: 'wms-ext', description: 'ext', tags: 'wms,advance', version: '1.2.0' }),
      );
      writeSkill(
        pluginDir,
        'aux-tool',
        makeSkillMd({ name: 'aux-tool', description: 'aux', tags: 'tool' }),
      );

      loader = new SkillLoader({
        bundledSkillsDir: bundledDir,
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });
      const result = await loader.loadAll();
      skills = result.skills;
    });

    it('getLoadedSkills 应返回所有加载的技能', () => {
      expect(loader.getLoadedSkills().length).toBe(skills.length);
    });

    it('getSkillByName 应通过名称查找', () => {
      const found = loader.getSkillByName('wms-core');
      expect(found).toBeDefined();
      expect(found?.skill.name).toBe('wms-core');

      expect(loader.getSkillByName('not-exist')).toBeUndefined();
    });

    it('getSkillById 应与 getSkillByName 行为一致', () => {
      expect(loader.getSkillById('wms-ext')?.skill.name).toBe('wms-ext');
    });

    it('getSkillsByTag 应通过 frontmatter.tags 过滤', () => {
      const wmsSkills = loader.getSkillsByTag('wms');
      expect(wmsSkills.length).toBe(2);
      expect(wmsSkills.map((s) => s.skill.name).sort()).toEqual(['wms-core', 'wms-ext']);

      const toolSkills = loader.getSkillsByTag('tool');
      expect(toolSkills.length).toBe(1);
      expect(toolSkills[0].skill.name).toBe('aux-tool');

      expect(loader.getSkillsByTag('nonexistent')).toHaveLength(0);
    });

    it('getSkillsBySource 应按 SkillSource 过滤', () => {
      expect(loader.getSkillsBySource('bundled').length).toBe(1);
      expect(loader.getSkillsBySource('workspace').length).toBe(1);
      expect(loader.getSkillsBySource('unknown').length).toBe(1);
    });

    it('getSkillsByVersion 应按 frontmatter.version 过滤', () => {
      expect(loader.getSkillsByVersion('1.0.0').length).toBe(1);
      expect(loader.getSkillsByVersion('1.2.0').length).toBe(1);
      expect(loader.getSkillsByVersion('9.9.9')).toHaveLength(0);
    });

    it('getStats 应返回正确的统计', () => {
      const stats = loader.getStats();
      expect(stats.total).toBe(3);
      expect(stats.enabled).toBe(3);
      expect(stats.disabled).toBe(0);
      expect(stats.bySource.bundled).toBe(1);
      expect(stats.bySource.workspace).toBe(1);
      expect(stats.bySource.unknown).toBe(1);
    });
  });

  describe('refresh / clear', () => {
    it('clear 应清空已加载技能', async () => {
      writeSkill(bundledDir, 'skill-x', makeSkillMd({ name: 'skill-x' }));
      const loader = new SkillLoader({
        bundledSkillsDir: bundledDir,
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });
      await loader.loadAll();
      expect(loader.getLoadedSkills().length).toBe(1);
      loader.clear();
      expect(loader.getLoadedSkills().length).toBe(0);
    });

    it('refresh 应重新加载', async () => {
      writeSkill(bundledDir, 'skill-a', makeSkillMd({ name: 'skill-a' }));
      const loader = new SkillLoader({
        bundledSkillsDir: bundledDir,
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });
      await loader.loadAll({ sources: ['bundled'] });
      expect(loader.getLoadedSkills().length).toBe(1);

      // 添加新技能
      writeSkill(bundledDir, 'skill-b', makeSkillMd({ name: 'skill-b' }));
      const result = await loader.refresh({ sources: ['bundled'] });
      expect(result.loadedCount).toBe(2);
      expect(loader.getLoadedSkills().length).toBe(2);
    });
  });

  describe('tags 解析兼容性', () => {
    it('应支持 [a,b] 风格的 tags', async () => {
      const skillDir = path.join(bundledDir, 'bracketed');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: bracketed\ntags: [wms,advance,tool]\n---\n\n# 内容',
        'utf-8',
      );

      const loader = new SkillLoader({
        bundledSkillsDir: bundledDir,
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });
      await loader.loadAll({ sources: ['bundled'] });

      const wmsSkills = loader.getSkillsByTag('wms');
      expect(wmsSkills.length).toBe(1);

      const toolSkills = loader.getSkillsByTag('tool');
      expect(toolSkills.length).toBe(1);
    });

    it('没有 tags 字段时 getSkillsByTag 应返回空数组', async () => {
      writeSkill(bundledDir, 'no-tags', makeSkillMd({ name: 'no-tags' }));
      const loader = new SkillLoader({
        bundledSkillsDir: bundledDir,
        workspaceSkillsDir: workspaceDir,
        pluginSkillsDir: pluginDir,
      });
      await loader.loadAll({ sources: ['bundled'] });
      expect(loader.getSkillsByTag('anything')).toHaveLength(0);
    });
  });
});
