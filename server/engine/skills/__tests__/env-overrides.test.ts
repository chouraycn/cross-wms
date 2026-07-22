import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  registerSkillEnvOverride,
  getSkillEnv,
  setSkillEnvVar,
  getSkillEnvVar,
  removeSkillEnvOverride,
  listSkillEnvOverrides,
  clearAllSkillEnvOverrides,
  applySkillEnvToProcess,
  restoreProcessEnv,
  loadSkillEnvFromFile,
  saveSkillEnvToFile,
} from '../runtime/env-overrides.js';

describe('env-overrides', () => {
  beforeEach(() => {
    clearAllSkillEnvOverrides();
  });

  afterEach(() => {
    clearAllSkillEnvOverrides();
  });

  describe('基本注册和获取', () => {
    it('应该能注册和获取技能的环境变量', () => {
      registerSkillEnvOverride('test-skill', {
        API_KEY: 'test-key-123',
        API_URL: 'https://api.example.com',
      });

      const env = getSkillEnv('test-skill', { inheritDefaults: false });

      expect(env.API_KEY).toBe('test-key-123');
      expect(env.API_URL).toBe('https://api.example.com');
    });

    it('相同 source 的注册应该覆盖之前的配置', () => {
      registerSkillEnvOverride('test-skill', { KEY: 'value1' }, 'config');
      registerSkillEnvOverride('test-skill', { KEY: 'value2' }, 'config');

      const env = getSkillEnv('test-skill', { inheritDefaults: false });

      expect(env.KEY).toBe('value2');
    });

    it('不同 source 的注册应该共存', () => {
      registerSkillEnvOverride('test-skill', { KEY_A: 'a' }, 'source-a');
      registerSkillEnvOverride('test-skill', { KEY_B: 'b' }, 'source-b');

      const env = getSkillEnv('test-skill', { inheritDefaults: false });

      expect(env.KEY_A).toBe('a');
      expect(env.KEY_B).toBe('b');
    });

    it('默认继承 process.env', () => {
      process.env.TEST_INHERITED_VAR = 'inherited-value';
      registerSkillEnvOverride('test-skill', { SKILL_VAR: 'skill-value' });

      const env = getSkillEnv('test-skill');

      expect(env.TEST_INHERITED_VAR).toBe('inherited-value');
      expect(env.SKILL_VAR).toBe('skill-value');

      delete process.env.TEST_INHERITED_VAR;
    });

    it('inheritDefaults=false 时不继承 process.env', () => {
      process.env.TEST_NO_INHERIT = 'should-not-appear';
      registerSkillEnvOverride('test-skill', { SKILL_VAR: 'skill-value' });

      const env = getSkillEnv('test-skill', { inheritDefaults: false });

      expect(env.TEST_NO_INHERIT).toBeUndefined();
      expect(env.SKILL_VAR).toBe('skill-value');

      delete process.env.TEST_NO_INHERIT;
    });
  });

  describe('优先级合并', () => {
    it('高优先级应该覆盖低优先级', () => {
      registerSkillEnvOverride('test-skill', { KEY: 'low' }, 'low-source', 10);
      registerSkillEnvOverride('test-skill', { KEY: 'high' }, 'high-source', 200);

      const env = getSkillEnv('test-skill', { inheritDefaults: false });

      expect(env.KEY).toBe('high');
    });

    it('同优先级后注册的优先', () => {
      registerSkillEnvOverride('test-skill', { KEY: 'first' }, 'first-source', 100);
      registerSkillEnvOverride('test-skill', { KEY: 'second' }, 'second-source', 100);

      const env = getSkillEnv('test-skill', { inheritDefaults: false });

      expect(env.KEY).toBe('second');
    });

    it('技能级别覆盖应该优先于全局级别', () => {
      registerSkillEnvOverride('__global__', { KEY: 'global-value' }, 'global-config', 1000);
      registerSkillEnvOverride('test-skill', { KEY: 'skill-value' }, 'skill-config', 10);

      const env = getSkillEnv('test-skill', { inheritDefaults: false });

      expect(env.KEY).toBe('skill-value');
    });

    it('全局覆盖应该对所有技能生效', () => {
      registerSkillEnvOverride('__global__', { GLOBAL_KEY: 'global-value' }, 'global-config', 50);
      registerSkillEnvOverride('skill-a', { A_KEY: 'a-value' }, 'a-config', 100);
      registerSkillEnvOverride('skill-b', { B_KEY: 'b-value' }, 'b-config', 100);

      const envA = getSkillEnv('skill-a', { inheritDefaults: false });
      const envB = getSkillEnv('skill-b', { inheritDefaults: false });

      expect(envA.GLOBAL_KEY).toBe('global-value');
      expect(envA.A_KEY).toBe('a-value');
      expect(envB.GLOBAL_KEY).toBe('global-value');
      expect(envB.B_KEY).toBe('b-value');
    });
  });

  describe('单变量设置/获取', () => {
    it('setSkillEnvVar 应该设置单个变量', () => {
      setSkillEnvVar('test-skill', 'SINGLE_KEY', 'single-value');

      const env = getSkillEnv('test-skill', { inheritDefaults: false });

      expect(env.SINGLE_KEY).toBe('single-value');
    });

    it('getSkillEnvVar 应该获取单个变量', () => {
      registerSkillEnvOverride('test-skill', { MY_KEY: 'my-value' });

      const value = getSkillEnvVar('test-skill', 'MY_KEY', { inheritDefaults: false });

      expect(value).toBe('my-value');
    });

    it('getSkillEnvVar 对于不存在的变量返回 undefined', () => {
      const value = getSkillEnvVar('test-skill', 'NONEXISTENT', { inheritDefaults: false });

      expect(value).toBeUndefined();
    });

    it('setSkillEnvVar 应该可以在已有 source 上追加变量', () => {
      registerSkillEnvOverride('test-skill', { KEY1: 'value1' }, 'my-source');
      setSkillEnvVar('test-skill', 'KEY2', 'value2', 'my-source');

      const env = getSkillEnv('test-skill', { inheritDefaults: false });

      expect(env.KEY1).toBe('value1');
      expect(env.KEY2).toBe('value2');
    });

    it('setSkillEnvVar 覆盖已有 key', () => {
      setSkillEnvVar('test-skill', 'KEY', 'old-value', 'my-source');
      setSkillEnvVar('test-skill', 'KEY', 'new-value', 'my-source');

      const value = getSkillEnvVar('test-skill', 'KEY', { inheritDefaults: false });

      expect(value).toBe('new-value');
    });
  });

  describe('移除功能', () => {
    it('removeSkillEnvOverride 按 source 移除', () => {
      registerSkillEnvOverride('test-skill', { KEEP: 'yes' }, 'keep-source');
      registerSkillEnvOverride('test-skill', { REMOVE: 'yes' }, 'remove-source');

      removeSkillEnvOverride('test-skill', 'remove-source');

      const env = getSkillEnv('test-skill', { inheritDefaults: false });

      expect(env.KEEP).toBe('yes');
      expect(env.REMOVE).toBeUndefined();
    });

    it('removeSkillEnvOverride 移除技能的所有覆盖', () => {
      registerSkillEnvOverride('test-skill', { A: '1' }, 'source-a');
      registerSkillEnvOverride('test-skill', { B: '2' }, 'source-b');

      removeSkillEnvOverride('test-skill');

      const env = getSkillEnv('test-skill', { inheritDefaults: false });

      expect(env.A).toBeUndefined();
      expect(env.B).toBeUndefined();
    });

    it('clearAllSkillEnvOverrides 清空所有', () => {
      registerSkillEnvOverride('skill-a', { A: '1' });
      registerSkillEnvOverride('skill-b', { B: '2' });

      clearAllSkillEnvOverrides();

      const list = listSkillEnvOverrides();
      expect(list.length).toBe(0);
    });
  });

  describe('列表功能', () => {
    it('listSkillEnvOverrides 列出所有覆盖', () => {
      registerSkillEnvOverride('skill-a', { A: '1' }, 'src-a', 100);
      registerSkillEnvOverride('skill-b', { B: '2' }, 'src-b', 200);

      const list = listSkillEnvOverrides();

      expect(list.length).toBe(2);
      const skillNames = list.map((o) => o.skillName).sort();
      expect(skillNames).toEqual(['skill-a', 'skill-b']);
    });

    it('listSkillEnvOverrides(skillName) 列出指定技能的覆盖', () => {
      registerSkillEnvOverride('skill-a', { A: '1' }, 'src-a');
      registerSkillEnvOverride('skill-a', { B: '2' }, 'src-b');
      registerSkillEnvOverride('skill-b', { C: '3' }, 'src-c');

      const list = listSkillEnvOverrides('skill-a');

      expect(list.length).toBe(2);
      expect(list.every((o) => o.skillName === 'skill-a')).toBe(true);
    });

    it('返回的 env 应该是副本，修改不影响内部状态', () => {
      registerSkillEnvOverride('test-skill', { KEY: 'original' });

      const list = listSkillEnvOverrides('test-skill');
      list[0].env.KEY = 'modified';

      const env = getSkillEnv('test-skill', { inheritDefaults: false });
      expect(env.KEY).toBe('original');
    });
  });

  describe('process.env 临时应用和恢复', () => {
    const ORIGINAL_VAR = 'ENV_OVERRIDE_TEST_ORIGINAL';
    const SKILL_VAR = 'ENV_OVERRIDE_TEST_SKILL';

    beforeEach(() => {
      process.env[ORIGINAL_VAR] = 'original-value';
      delete process.env[SKILL_VAR];
    });

    afterEach(() => {
      delete process.env[ORIGINAL_VAR];
      delete process.env[SKILL_VAR];
    });

    it('applySkillEnvToProcess 应该将技能环境变量应用到 process.env', () => {
      registerSkillEnvOverride('test-skill', { [SKILL_VAR]: 'skill-value' });

      const snapshot = applySkillEnvToProcess('test-skill');

      expect(process.env[SKILL_VAR]).toBe('skill-value');
      expect(snapshot.skillName).toBe('test-skill');

      restoreProcessEnv(snapshot);
    });

    it('restoreProcessEnv 应该恢复原始 process.env', () => {
      registerSkillEnvOverride('test-skill', { [SKILL_VAR]: 'skill-value' });

      const snapshot = applySkillEnvToProcess('test-skill');
      restoreProcessEnv(snapshot);

      expect(process.env[ORIGINAL_VAR]).toBe('original-value');
      expect(process.env[SKILL_VAR]).toBeUndefined();
    });

    it('应该正确恢复新增和删除的变量', () => {
      process.env.TEMP_VAR_BEFORE = 'before-value';
      registerSkillEnvOverride('test-skill', {
        TEMP_VAR_NEW: 'new-value',
      });

      const snapshot = applySkillEnvToProcess('test-skill');
      expect(process.env.TEMP_VAR_BEFORE).toBe('before-value');
      expect(process.env.TEMP_VAR_NEW).toBe('new-value');

      delete process.env.TEMP_VAR_BEFORE;
      process.env.TEMP_VAR_RUNTIME = 'runtime-value';

      restoreProcessEnv(snapshot);

      expect(process.env.TEMP_VAR_BEFORE).toBe('before-value');
      expect(process.env.TEMP_VAR_NEW).toBeUndefined();
      expect(process.env.TEMP_VAR_RUNTIME).toBeUndefined();

      delete process.env.TEMP_VAR_BEFORE;
    });
  });

  describe('文件持久化', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-overrides-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('saveSkillEnvToFile 应该保存到文件', () => {
      registerSkillEnvOverride('skill-a', { KEY_A: 'value-a' }, 'src-a', 100);
      registerSkillEnvOverride('skill-b', { KEY_B: 'value-b' }, 'src-b', 200);

      const configPath = path.join(tmpDir, 'env-config.json');
      saveSkillEnvToFile(configPath);

      expect(fs.existsSync(configPath)).toBe(true);
      const raw = fs.readFileSync(configPath, 'utf-8');
      const data = JSON.parse(raw);

      expect(data.version).toBe(1);
      expect(data.overrides.length).toBe(2);
      expect(data.updatedAt).toBeDefined();
    });

    it('loadSkillEnvFromFile 应该从文件加载', () => {
      const configPath = path.join(tmpDir, 'env-config.json');
      const testData = {
        version: 1,
        overrides: [
          {
            skillName: 'loaded-skill',
            env: { LOADED_KEY: 'loaded-value' },
            source: 'file-source',
            priority: 150,
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(testData), 'utf-8');

      loadSkillEnvFromFile(configPath);

      const env = getSkillEnv('loaded-skill', { inheritDefaults: false });
      expect(env.LOADED_KEY).toBe('loaded-value');
    });

    it('保存后再加载应该恢复相同的配置', () => {
      registerSkillEnvOverride('skill-x', { X: '100' }, 'src-x', 50);
      registerSkillEnvOverride('skill-y', { Y: '200' }, 'src-y', 150);

      const configPath = path.join(tmpDir, 'roundtrip.json');
      saveSkillEnvToFile(configPath);

      clearAllSkillEnvOverrides();
      expect(listSkillEnvOverrides().length).toBe(0);

      loadSkillEnvFromFile(configPath);

      const envX = getSkillEnv('skill-x', { inheritDefaults: false });
      const envY = getSkillEnv('skill-y', { inheritDefaults: false });

      expect(envX.X).toBe('100');
      expect(envY.Y).toBe('200');
    });

    it('loadSkillEnvFromFile 对于不存在的文件应该抛出错误', () => {
      const badPath = path.join(tmpDir, 'nonexistent.json');
      expect(() => loadSkillEnvFromFile(badPath)).toThrow();
    });

    it('saveSkillEnvToFile 应该自动创建目录', () => {
      const configPath = path.join(tmpDir, 'sub', 'dir', 'config.json');
      registerSkillEnvOverride('test', { K: 'v' });

      saveSkillEnvToFile(configPath);

      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('loadSkillEnvFromFile 应该使用默认的 source 和 priority', () => {
      const configPath = path.join(tmpDir, 'partial.json');
      const testData = {
        version: 1,
        overrides: [
          {
            skillName: 'partial-skill',
            env: { PARTIAL: 'yes' },
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(testData), 'utf-8');

      loadSkillEnvFromFile(configPath);

      const list = listSkillEnvOverrides('partial-skill');
      expect(list.length).toBe(1);
      expect(list[0].source).toBe('default');
      expect(list[0].priority).toBe(100);
    });
  });
});
