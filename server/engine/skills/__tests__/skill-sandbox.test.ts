import { describe, it, expect, beforeEach } from 'vitest';
import { SkillSandbox } from '../skill-sandbox.js';
import type { SkillEntry } from '../types.js';

function makeSkillEntry(opts: {
  name?: string;
  description?: string;
  version?: string;
  disableModelInvocation?: boolean;
  dependencies?: string;
  dependsOn?: string;
}): SkillEntry {
  const frontmatter: Record<string, string> = {};
  if (opts.version) frontmatter.version = opts.version;
  if (opts.dependencies) frontmatter.dependencies = opts.dependencies;
  if (opts.dependsOn) frontmatter['depends-on'] = opts.dependsOn;

  return {
    skill: {
      name: opts.name ?? 'test-skill',
      description: opts.description ?? 'A test skill',
      filePath: '/tmp/skill/SKILL.md',
      baseDir: '/tmp/skill',
      source: 'bundled',
      disableModelInvocation: opts.disableModelInvocation ?? false,
    },
    frontmatter,
  };
}

describe('SkillSandbox', () => {
  let sandbox: SkillSandbox;

  beforeEach(() => {
    sandbox = new SkillSandbox();
  });

  describe('默认配置', () => {
    it('应提供默认权限', () => {
      const config = sandbox.getConfig();
      expect(config.allowedPermissions).toContain('network.read');
      expect(config.allowedPermissions).toContain('tool.use');
      expect(config.allowedPermissions).toContain('memory.read');
      expect(config.allowedPermissions).toContain('memory.write');
    });

    it('应默认屏蔽危险 API', () => {
      const config = sandbox.getConfig();
      expect(config.blockedApis).toContain('eval');
      expect(config.blockedApis).toContain('Function');
      expect(config.blockedApis).toContain('require');
      expect(config.blockedApis).toContain('process.exit');
      expect(config.blockedApis).toContain('child_process');
    });

    it('应提供默认超时和内存限制', () => {
      const config = sandbox.getConfig();
      expect(config.maxExecutionTimeMs).toBe(30000);
      expect(config.maxMemoryMB).toBe(256);
    });

    it('应默认屏蔽系统路径', () => {
      const config = sandbox.getConfig();
      expect(config.blockedPaths).toContain('/etc');
      expect(config.blockedPaths).toContain('/usr');
      expect(config.blockedPaths).toContain('/bin');
      expect(config.blockedPaths).toContain('/sbin');
    });
  });

  describe('execute', () => {
    it('应成功执行返回结果', async () => {
      const skill = makeSkillEntry({});
      const result = await sandbox.execute(skill, () => 42);

      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
      expect(result.context.skillId).toBe('test-skill');
    });

    it('应支持异步函数', async () => {
      const skill = makeSkillEntry({});
      const result = await sandbox.execute(skill, async () => {
        return await Promise.resolve('async-result');
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('async-result');
    });

    it('应捕获函数异常并返回 success=false', async () => {
      const skill = makeSkillEntry({});
      const result = await sandbox.execute(skill, () => {
        throw new Error('boom');
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('boom');
      expect(result.context.skillId).toBe('test-skill');
    });

    it('应捕获 Promise 拒绝', async () => {
      const skill = makeSkillEntry({});
      const result = await sandbox.execute(skill, async () => {
        await Promise.resolve();
        throw new Error('async-fail');
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('async-fail');
    });

    it('应在 context 中填充技能信息', async () => {
      const skill = makeSkillEntry({ name: 'my-skill', version: '3.1.0' });
      const result = await sandbox.execute(skill, () => 'ok');

      expect(result.context.skillId).toBe('my-skill');
      expect(result.context.skillVersion).toBe('3.1.0');
      expect(result.context.permissions).toContain('tool.use');
      expect(typeof result.context.startTime).toBe('number');
      expect(result.context.memoryUsedMB).toBeGreaterThanOrEqual(0);
    });

    it('无 frontmatter.version 时 skillVersion 应为 "unknown"', async () => {
      const skill = makeSkillEntry({});
      const result = await sandbox.execute(skill, () => 'ok');
      expect(result.context.skillVersion).toBe('unknown');
    });

    it('disableModelInvocation=true 时应拒绝执行', async () => {
      const skill = makeSkillEntry({ disableModelInvocation: true });
      const result = await sandbox.execute(skill, () => 'should-not-run');

      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('技能描述为空且 frontmatter 无 description 时应拒绝执行', async () => {
      const skill = makeSkillEntry({ description: '' });
      // 删除 frontmatter.description（如果有）
      skill.frontmatter = {};
      const result = await sandbox.execute(skill, () => 'should-not-run');

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty content');
    });

    it('frontmatter.description 存在但 skill.description 为空时仍可执行', async () => {
      const skill = makeSkillEntry({ description: '' });
      skill.frontmatter.description = 'fallback description';
      const result = await sandbox.execute(skill, () => 'ok');

      expect(result.success).toBe(true);
    });

    it('函数体包含 blockedApis 时应拒绝执行', async () => {
      const skill = makeSkillEntry({});
      // 函数字符串中包含 "eval" 关键字
      const result = await sandbox.execute(skill, () => {
        // eslint-disable-next-line no-eval
        const placeholder = 'eval'; // 仅用于触发检查
        return placeholder;
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('blocked');
      expect(result.error).toContain('eval');
    });

    it('函数体包含 process.exit 时应拒绝执行', async () => {
      const skill = makeSkillEntry({});
      const result = await sandbox.execute(skill, () => {
        return 'process.exit(0) would be dangerous';
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('process.exit');
    });

    it('应支持超时控制', async () => {
      const customSandbox = new SkillSandbox({ maxExecutionTimeMs: 50 });
      const skill = makeSkillEntry({});
      const result = await customSandbox.execute(skill, async () => {
        await new Promise((r) => setTimeout(r, 200));
        return 'slow';
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
      expect(result.error).toContain('50ms');
    });

    it('快速完成的函数不应被超时影响', async () => {
      const customSandbox = new SkillSandbox({ maxExecutionTimeMs: 1000 });
      const skill = makeSkillEntry({});
      const result = await customSandbox.execute(skill, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'fast';
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('fast');
    });
  });

  describe('依赖检查', () => {
    it('frontmatter 中声明 dependencies 时应允许通过（默认允许所有）', async () => {
      const skill = makeSkillEntry({ dependencies: 'dep-a,dep-b' });
      const result = await sandbox.execute(skill, () => 'ok');
      expect(result.success).toBe(true);
    });

    it('frontmatter 中声明 depends-on 时也应允许通过', async () => {
      const skill = makeSkillEntry({ dependsOn: 'dep-c' });
      const result = await sandbox.execute(skill, () => 'ok');
      expect(result.success).toBe(true);
    });
  });

  describe('hasPermission', () => {
    it('应返回已配置权限的状态', () => {
      expect(sandbox.hasPermission('network.read')).toBe(true);
      expect(sandbox.hasPermission('tool.use')).toBe(true);
      expect(sandbox.hasPermission('network.write')).toBe(false);
      expect(sandbox.hasPermission('exec.shell')).toBe(false);
    });
  });

  describe('isPathAllowed', () => {
    it('应屏蔽默认系统路径', () => {
      expect(sandbox.isPathAllowed('/etc/passwd')).toBe(false);
      expect(sandbox.isPathAllowed('/usr/bin/ls')).toBe(false);
      expect(sandbox.isPathAllowed('/bin/sh')).toBe(false);
      expect(sandbox.isPathAllowed('/sbin/init')).toBe(false);
    });

    it('应允许非系统路径', () => {
      expect(sandbox.isPathAllowed('/home/user/file')).toBe(true);
      expect(sandbox.isPathAllowed('/tmp/test')).toBe(true);
      expect(sandbox.isPathAllowed('/var/log/app')).toBe(true);
    });

    it('当配置 allowedPaths 时应仅允许白名单路径', () => {
      const customSandbox = new SkillSandbox({
        allowedPaths: ['/workspace/skills', '/tmp/sandbox'],
      });
      expect(customSandbox.isPathAllowed('/workspace/skills/s1/SKILL.md')).toBe(true);
      expect(customSandbox.isPathAllowed('/tmp/sandbox/file')).toBe(true);
      expect(customSandbox.isPathAllowed('/home/user/file')).toBe(false);
    });

    it('allowedPaths 配置时系统路径仍被屏蔽', () => {
      const customSandbox = new SkillSandbox({
        allowedPaths: ['/etc/subdir'], // 试图允许 /etc 下的子目录
      });
      // 注意：blockedPaths 优先级高于 allowedPaths
      expect(customSandbox.isPathAllowed('/etc/subdir/passwd')).toBe(false);
    });
  });

  describe('getConfig / updateConfig', () => {
    it('getConfig 返回的配置应不可被外部修改（深拷贝）', () => {
      const config = sandbox.getConfig();
      const originalApis = [...config.blockedApis];
      config.blockedApis.push('newApi');

      const config2 = sandbox.getConfig();
      expect(config2.blockedApis).toEqual(originalApis);
      expect(config2.blockedApis).not.toContain('newApi');
    });

    it('updateConfig 应合并配置', () => {
      sandbox.updateConfig({ maxExecutionTimeMs: 5000, maxMemoryMB: 128 });
      const config = sandbox.getConfig();
      expect(config.maxExecutionTimeMs).toBe(5000);
      expect(config.maxMemoryMB).toBe(128);
      // 未修改的字段应保持原值
      expect(config.allowedPermissions).toContain('tool.use');
    });

    it('updateConfig 应允许覆盖 allowedPermissions', () => {
      sandbox.updateConfig({
        allowedPermissions: ['file.read', 'file.write'],
      });
      const config = sandbox.getConfig();
      expect(config.allowedPermissions).toEqual(['file.read', 'file.write']);
      expect(sandbox.hasPermission('tool.use')).toBe(false);
      expect(sandbox.hasPermission('file.read')).toBe(true);
    });

    it('updateConfig 应允许添加自定义 blockedApis', () => {
      sandbox.updateConfig({ blockedApis: ['customDanger'] });
      const config = sandbox.getConfig();
      // 默认值被覆盖（合并语义）
      expect(config.blockedApis).toEqual(['customDanger']);
    });
  });

  describe('复杂场景', () => {
    it('多次 execute 应共用配置', async () => {
      const skill1 = makeSkillEntry({ name: 'skill-1' });
      const skill2 = makeSkillEntry({ name: 'skill-2' });

      const r1 = await sandbox.execute(skill1, () => 1);
      const r2 = await sandbox.execute(skill2, () => 2);

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r1.context.skillId).toBe('skill-1');
      expect(r2.context.skillId).toBe('skill-2');
    });

    it('并发执行多个技能应互不影响', async () => {
      const skill = makeSkillEntry({ name: 'concurrent' });
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          sandbox.execute(skill, () => i).then((r) => ({ i, r })),
        ),
      );

      for (const { i, r } of results) {
        expect(r.success).toBe(true);
        expect(r.result).toBe(i);
      }
    });
  });
});
