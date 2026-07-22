import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { SkillLoader } from '../skill-loader.js';

const BUILTIN_SKILLS_DIR = path.resolve(__dirname, '../../../../server/engine/skills/builtin');

const EXPECTED_SKILLS = [
  '1password',
  'apple-notes',
  'apple-reminders',
  'bear-notes',
  'blucli',
  'blogwatcher',
  'camsnap',
  'clawhub',
  'coding-agent',
  'diagram-maker',
  'eightctl',
  'gemini',
  'gh-issues',
  'gifgrep',
  'github',
  'gog',
  'goplaces',
  'healthcheck',
  'himalaya',
  'imsg',
  'mcporter',
  'meme-maker',
  'model-usage',
  'nano-pdf',
  'node-connect',
  'node-inspect-debugger',
  'notion',
  'obsidian',
  'openai-whisper',
  'openai-whisper-api',
  'openhue',
  'oracle',
  'ordercli',
  'peekaboo',
  'python-debugpy',
  'sag',
  'sherpa-onnx-tts',
  'session-logs',
  'skill-creator',
  'songsee',
  'sonoscli',
  'spike',
  'spotify-player',
  'summarize',
  'taskflow',
  'taskflow-inbox-triage',
  'things-mac',
  'tmux',
  'trello',
  'video-frames',
  'weather',
  'xurl',
];

// Skills that ship with an index.ts implementation module.
// Migrated skills (from openclaw) only include SKILL.md (+ optional scripts/references).
const SKILLS_WITH_INDEX_TS = [
  '1password',
  'apple-notes',
  'apple-reminders',
  'bear-notes',
  'blogwatcher',
  'coding-agent',
  'diagram-maker',
  'gemini',
  'gh-issues',
  'gifgrep',
  'github',
  'healthcheck',
  'himalaya',
  'imsg',
  'meme-maker',
  'model-usage',
  'nano-pdf',
  'node-connect',
  'node-inspect-debugger',
  'notion',
  'obsidian',
  'openai-whisper',
  'python-debugpy',
  'sag',
  'sherpa-onnx-tts',
  'session-logs',
  'skill-creator',
  'spike',
  'summarize',
  'taskflow',
  'things-mac',
  'tmux',
  'trello',
  'video-frames',
  'weather',
  'xurl',
];

describe('Builtin Skills', () => {
  describe('目录结构', () => {
    it('所有 52 个技能目录都存在', () => {
      const dirs = fs.readdirSync(BUILTIN_SKILLS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();

      expect(dirs).toEqual(EXPECTED_SKILLS.sort());
    });

    it('每个技能目录都有 SKILL.md 文件', () => {
      for (const skillName of EXPECTED_SKILLS) {
        const skillMdPath = path.join(BUILTIN_SKILLS_DIR, skillName, 'SKILL.md');
        expect(fs.existsSync(skillMdPath), `${skillName} 缺少 SKILL.md`).toBe(true);
      }
    });

    it('带有 index.ts 实现模块的技能目录都存在 index.ts 文件', () => {
      for (const skillName of SKILLS_WITH_INDEX_TS) {
        const indexPath = path.join(BUILTIN_SKILLS_DIR, skillName, 'index.ts');
        expect(fs.existsSync(indexPath), `${skillName} 缺少 index.ts`).toBe(true);
      }
    });
  });

  describe('SKILL.md 格式', () => {
    EXPECTED_SKILLS.forEach((skillName) => {
      it(`${skillName}: 包含有效的 frontmatter`, () => {
        const skillMdPath = path.join(BUILTIN_SKILLS_DIR, skillName, 'SKILL.md');
        const content = fs.readFileSync(skillMdPath, 'utf-8');

        expect(content.startsWith('---'), `${skillName}: 缺少 frontmatter 开头`).toBe(true);
        expect(content.slice(3).includes('---'), `${skillName}: 缺少 frontmatter 结束`).toBe(true);
      });

      it(`${skillName}: frontmatter 包含 name 和 description`, () => {
        const skillMdPath = path.join(BUILTIN_SKILLS_DIR, skillName, 'SKILL.md');
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const fmEnd = content.indexOf('---', 3);
        const frontmatter = content.slice(3, fmEnd);

        expect(frontmatter.includes('name:'), `${skillName}: 缺少 name 字段`).toBe(true);
        expect(frontmatter.includes('description:'), `${skillName}: 缺少 description 字段`).toBe(true);
      });

      it(`${skillName}: 包含功能描述和使用示例`, () => {
        const skillMdPath = path.join(BUILTIN_SKILLS_DIR, skillName, 'SKILL.md');
        const content = fs.readFileSync(skillMdPath, 'utf-8');

        expect(
          content.includes('## 功能') || content.includes('# ') || content.includes('## '),
          `${skillName}: 缺少功能描述`,
        ).toBe(true);
        expect(
          content.includes('使用示例') || content.includes('示例') || content.includes('```') || content.includes('`'),
          `${skillName}: 缺少使用示例`,
        ).toBe(true);
      });
    });
  });

  describe('SkillLoader 加载', () => {
    it('SkillLoader 可以加载所有内置技能', async () => {
      const loader = new SkillLoader({
        bundledSkillsDir: BUILTIN_SKILLS_DIR,
        workspaceSkillsDir: '/nonexistent',
        pluginSkillsDir: '/nonexistent',
      });

      const result = await loader.loadAll({ sources: ['bundled'] });

      expect(result.loadedCount).toBe(52);
      expect(result.skippedCount).toBe(0);
      expect(result.skills).toHaveLength(52);

      const loadedNames = result.skills.map((s) => s.skill.name).sort();
      expect(loadedNames).toEqual(EXPECTED_SKILLS.sort());
    });

    it('所有技能的 source 都是 bundled', async () => {
      const loader = new SkillLoader({
        bundledSkillsDir: BUILTIN_SKILLS_DIR,
        workspaceSkillsDir: '/nonexistent',
        pluginSkillsDir: '/nonexistent',
      });

      const result = await loader.loadAll({ sources: ['bundled'] });

      for (const entry of result.skills) {
        expect(entry.skill.source).toBe('bundled');
      }
    });

    it('所有技能都有有效的名称和描述', async () => {
      const loader = new SkillLoader({
        bundledSkillsDir: BUILTIN_SKILLS_DIR,
        workspaceSkillsDir: '/nonexistent',
        pluginSkillsDir: '/nonexistent',
      });

      const result = await loader.loadAll({ sources: ['bundled'] });

      for (const entry of result.skills) {
        expect(entry.skill.name).toBeTruthy();
        expect(entry.skill.name.length).toBeGreaterThan(0);
        expect(entry.skill.description).toBeTruthy();
        expect(entry.skill.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('技能分类', () => {
    it('技能按 category 正确分组', async () => {
      const loader = new SkillLoader({
        bundledSkillsDir: BUILTIN_SKILLS_DIR,
        workspaceSkillsDir: '/nonexistent',
        pluginSkillsDir: '/nonexistent',
      });

      const result = await loader.loadAll({ sources: ['bundled'] });

      const categories: Record<string, string[]> = {};
      for (const entry of result.skills) {
        const cat = entry.frontmatter.category || 'uncategorized';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(entry.skill.name);
      }

      expect(Object.keys(categories).length).toBeGreaterThanOrEqual(5);
      expect(categories['general']).toContain('weather');
      expect(categories['development']).toContain('skill-creator');
      expect(categories['development']).toContain('sag');
      expect(categories['utilities']).toContain('nano-pdf');
      expect(categories['utilities']).toContain('session-logs');
      expect(categories['productivity']).toContain('diagram-maker');
      expect(categories['productivity']).toContain('blogwatcher');
      expect(categories['media']).toContain('gifgrep');
      expect(categories['media']).toContain('video-frames');
      expect(categories['system']).toContain('healthcheck');
    });
  });
});
