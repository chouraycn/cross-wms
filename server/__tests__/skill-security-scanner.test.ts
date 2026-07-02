/**
 * Skill Security Scanner 单元测试
 *
 * 测试 Skill 安全扫描与审计系统。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillSecurityScanner } from '../engine/skillSecurityScanner.js';
import type { SkillDefinition } from '../types/skill-runtime.js';

function createMockDefinition(
  id: string,
  options: Partial<SkillDefinition> = {},
): SkillDefinition {
  return {
    id,
    name: id,
    description: `${id} description`,
    group: 'util',
    source: 'builtin',
    ...options,
  };
}

describe('SkillSecurityScanner', () => {
  let scanner: SkillSecurityScanner;

  beforeEach(() => {
    scanner = new SkillSecurityScanner();
  });

  describe('静态扫描', () => {
    it('无风险内容应返回 none 等级', () => {
      const def = createMockDefinition('safe_skill', {
        skillMdContent: '# Safe Skill\nThis is a safe skill.',
      });

      const result = scanner.scanSkill(def);
      expect(result.overallRisk).toBe('none');
      expect(result.findings.length).toBe(0);
      expect(result.passed).toBe(true);
    });

    it('应检测危险命令', () => {
      const def = createMockDefinition('dangerous_skill', {
        skillMdContent: 'Run: rm -rf /',
      });

      const result = scanner.scanSkill(def);
      expect(result.overallRisk).toBe('critical');
      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type === 'dangerous_command')).toBe(true);
    });

    it('应检测敏感路径', () => {
      const def = createMockDefinition('path_skill', {
        skillMdContent: 'Read /etc/passwd',
      });

      const result = scanner.scanSkill(def);
      expect(result.findings.some((f) => f.type === 'sensitive_path')).toBe(true);
    });

    it('应检测 SSH 密钥访问', () => {
      const def = createMockDefinition('ssh_skill', {
        skillMdContent: 'Access ~/.ssh/id_rsa',
      });

      const result = scanner.scanSkill(def);
      expect(result.findings.some((f) => f.type === 'sensitive_path')).toBe(true);
    });

    it('应检测代码注入风险', () => {
      const def = createMockDefinition('eval_skill', {
        skillMdContent: 'eval("user_input")',
      });

      const result = scanner.scanSkill(def);
      expect(result.findings.some((f) => f.type === 'code_injection')).toBe(true);
    });

    it('应检测凭证泄露', () => {
      const def = createMockDefinition('cred_skill', {
        skillMdContent: 'const api_key = "sk-12345"',
      });

      const result = scanner.scanSkill(def);
      expect(result.findings.some((f) => f.type === 'credential_leak')).toBe(true);
    });

    it('应检测 sudo 提权', () => {
      const def = createMockDefinition('sudo_skill', {
        skillMdContent: 'sudo apt install',
      });

      const result = scanner.scanSkill(def);
      const hasDangerousCmd = result.findings.some(
        (f) => f.type === 'dangerous_command' && f.level === 'medium',
      );
      expect(hasDangerousCmd).toBe(true);
    });
  });

  describe('风险等级计算', () => {
    it('多个低风险应为 low', () => {
      const def = createMockDefinition('low_risk', {
        skillMdContent: 'echo > /dev/null',
      });

      const result = scanner.scanSkill(def);
      expect(result.overallRisk).toBe('low');
    });

    it('包含 critical 风险应为 critical', () => {
      const def = createMockDefinition('critical_risk', {
        skillMdContent: 'rm -rf / etc',
      });

      const result = scanner.scanSkill(def);
      expect(result.overallRisk).toBe('critical');
    });

    it('high + low 风险应为 high', () => {
      const def = createMockDefinition('high_risk', {
        skillMdContent: 'Read /etc/passwd and echo > /dev/null',
      });

      const result = scanner.scanSkill(def);
      expect(result.overallRisk).toBe('high');
    });
  });

  describe('缓存功能', () => {
    it('重复扫描应使用缓存', () => {
      const def = createMockDefinition('cached_skill', {
        version: '1.0.0',
        skillMdContent: 'safe content',
      });

      const result1 = scanner.scanSkill(def);
      const result2 = scanner.scanSkill(def);

      expect(result1).toBe(result2); // 同一引用
    });

    it('不使用缓存时应重新扫描', () => {
      const def = createMockDefinition('no_cache_skill', {
        version: '1.0.0',
        skillMdContent: 'safe content',
      });

      const result1 = scanner.scanSkill(def, false);
      const result2 = scanner.scanSkill(def, false);

      expect(result1).not.toBe(result2); // 不同引用
      expect(result1.overallRisk).toBe(result2.overallRisk);
    });

    it('清除缓存后应重新扫描', () => {
      const def = createMockDefinition('clear_cache_skill', {
        version: '1.0.0',
        skillMdContent: 'safe',
      });

      const result1 = scanner.scanSkill(def);
      scanner.clearCache();
      const result2 = scanner.scanSkill(def);

      expect(result1).not.toBe(result2);
    });
  });

  describe('审计日志', () => {
    it('应记录审计日志', () => {
      scanner.recordAudit({
        skillId: 'test_skill',
        sessionId: 'session-123',
        params: { query: 'test' },
        result: 'success',
        durationMs: 100,
        riskLevel: 'none',
      });

      const logs = scanner.queryAudit();
      expect(logs.length).toBe(1);
      expect(logs[0].skillId).toBe('test_skill');
      expect(logs[0].result).toBe('success');
    });

    it('应支持按 skillId 查询', () => {
      scanner.recordAudit({
        skillId: 'skill_a',
        sessionId: 's1',
        params: {},
        result: 'success',
        durationMs: 10,
        riskLevel: 'none',
      });
      scanner.recordAudit({
        skillId: 'skill_b',
        sessionId: 's2',
        params: {},
        result: 'failure',
        durationMs: 20,
        riskLevel: 'low',
      });

      const logs = scanner.queryAudit({ skillId: 'skill_a' });
      expect(logs.length).toBe(1);
      expect(logs[0].skillId).toBe('skill_a');
    });

    it('应支持按结果查询', () => {
      scanner.recordAudit({
        skillId: 's1',
        sessionId: 's',
        params: {},
        result: 'success',
        durationMs: 10,
        riskLevel: 'none',
      });
      scanner.recordAudit({
        skillId: 's2',
        sessionId: 's',
        params: {},
        result: 'failure',
        durationMs: 10,
        riskLevel: 'none',
      });
      scanner.recordAudit({
        skillId: 's3',
        sessionId: 's',
        params: {},
        result: 'blocked',
        durationMs: 10,
        riskLevel: 'none',
      });

      const successLogs = scanner.queryAudit({ result: 'success' });
      expect(successLogs.length).toBe(1);
    });

    it('应支持 limit 查询', () => {
      for (let i = 0; i < 10; i++) {
        scanner.recordAudit({
          skillId: `skill_${i}`,
          sessionId: 's',
          params: {},
          result: 'success',
          durationMs: 10,
          riskLevel: 'none',
        });
      }

      const logs = scanner.queryAudit({ limit: 3 });
      expect(logs.length).toBe(3);
    });
  });

  describe('isSafe 便捷方法', () => {
    it('安全的 Skill 应返回 true', () => {
      const def = createMockDefinition('safe', { skillMdContent: 'safe' });
      expect(scanner.isSafe(def)).toBe(true);
    });

    it('高风险 Skill 应返回 false', () => {
      const def = createMockDefinition('dangerous', { skillMdContent: 'rm -rf /' });
      expect(scanner.isSafe(def)).toBe(false);
    });
  });

  describe('统计信息', () => {
    it('应返回正确的统计信息', () => {
      scanner.scanSkill(createMockDefinition('skill1', { skillMdContent: 'safe' }));
      scanner.scanSkill(createMockDefinition('skill2', { skillMdContent: 'rm -rf /' }));

      const stats = scanner.getStats();
      expect(stats.scanned).toBe(2);
      expect(stats.passed + stats.failed).toBe(2);
    });
  });
});
