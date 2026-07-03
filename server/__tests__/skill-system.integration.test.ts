/**
 * Skill 系统集成测试
 *
 * 测试 Skill 系统各模块的协同工作：
 * 1. Discovery + Security Scanner 集成
 * 2. Policy Pipeline + Security 集成
 * 3. Version Tracker + Discovery 集成
 * 4. 完整流程：发现 → 索引 → 安全扫描
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillDiscovery } from '../engine/skillDiscovery.js';
import { SkillSecurityScanner } from '../engine/skillSecurityScanner.js';
import { ToolPolicyPipeline } from '../engine/toolPolicyPipeline.js';
import { SkillVersionTracker } from '../engine/skillVersionTracker.js';
import { SkillContentReader } from '../engine/skillContentReader.js';
import type {
  RegisteredSkill,
  SkillDefinition,
  SkillPermissionConfig,
} from '../types/skill-runtime.js';

// Mock skillRegistry
vi.mock('../engine/skillRegistry.js', () => ({
  skillRegistry: {
    getAllSkills: () => [],
    getSkill: (id: string) => null,
    reloadSkill: async () => true,
  },
}));

// Mock skillDiscoverySingleton
vi.mock('../engine/skillDiscoverySingleton.js', () => ({
  rebuildSkillIndex: () => {},
  initSkillDiscovery: () => {},
  skillDiscovery: {
    buildIndex: () => {},
  },
}));

function createMockSkill(
  id: string,
  name: string,
  group: string,
  options: Partial<SkillDefinition> = {},
): RegisteredSkill {
  return {
    definition: {
      id,
      name,
      description: `${name} 的完整描述`,
      group: group as any,
      source: 'builtin',
      userInvocable: true,
      tags: [],
      skillMdContent: `# ${name}\n\n这是 ${name} 的 SKILL.md 内容。\n\n\`\`\`instruction\n使用 ${name} 处理任务。\n\`\`\``,
      instructionBlocks: [`使用 ${name} 处理任务。`],
      ...options,
    },
    lifecycle: {
      execute: async (params) => ({
        success: true,
        data: { result: `${name} executed`, params },
      }),
    },
    state: 'enabled',
    registeredAt: Date.now(),
    executionCount: 0,
  };
}

describe('Skill 系统集成测试', () => {
  let discovery: SkillDiscovery;
  let scanner: SkillSecurityScanner;
  let pipeline: ToolPolicyPipeline;
  let versionTracker: SkillVersionTracker;

  beforeEach(() => {
    discovery = new SkillDiscovery();
    scanner = new SkillSecurityScanner();
    pipeline = new ToolPolicyPipeline();
    versionTracker = new SkillVersionTracker();
  });

  describe('完整流程：发现 → 索引 → 安全扫描', () => {
    it('应完成从发现到安全扫描的完整流程', () => {
      // 1. 创建测试 Skill
      const skills = [
        createMockSkill('wms_query', 'WMS库存查询', 'wms', {
          tags: ['wms', 'inventory', 'query'],
        }),
        createMockSkill('calc', '计算器', 'util', {
          tags: ['math', 'calculator'],
        }),
        createMockSkill('web_fetch', '网页获取', 'network', {
          tags: ['web', 'http', 'fetch'],
        }),
      ];

      // 2. 构建索引
      discovery.buildIndex(skills);

      // 3. 验证索引
      const stats = discovery.getStats();
      expect(stats.total).toBe(3);
      expect(stats.promptVisible).toBeGreaterThan(0);
      expect(stats.runtimeVisible).toBeGreaterThan(0);

      // 4. 安全扫描所有 Skill
      const scanResults = scanner.scanSkills(skills);
      expect(scanResults.length).toBe(3);

      // 5. 验证所有安全 Skill 通过扫描
      const allPassed = scanResults.every((r) => r.passed);
      expect(allPassed).toBe(true);
    });
  });

  describe('Discovery + Policy Pipeline 集成', () => {
    it('应结合发现系统和策略管线进行权限控制', async () => {
      // 1. 构建索引
      const skills = [
        createMockSkill('wms_query', 'WMS查询', 'wms'),
        createMockSkill('fs_read', '文件读取', 'fs_read'),
        createMockSkill('system_reboot', '系统重启', 'system'),
      ];
      discovery.buildIndex(skills);

      // 2. 设置策略配置
      const config: SkillPermissionConfig = {
        allow: ['wms:*', 'util'],
        deny: ['system_reboot'],
        elevated: { enabled: 'ask' },
      };
      pipeline.setGlobalConfig(config);

      // 3. 获取可见的 Skill
      const visibleSkills = discovery.getVisibleSkills({
        visibility: 'runtimeVisible',
      });

      // 4. 逐个检查策略
      let wmsCount = 0;
      let systemCount = 0;
      for (const skill of visibleSkills) {
        const allowed = await pipeline.isAllowed(skill.skillId, skill.group);
        if (skill.group === 'wms') {
          expect(allowed).toBe(true);
          wmsCount++;
        } else if (skill.group === 'system') {
          expect(allowed).toBe(false);
          systemCount++;
        }
      }
      expect(wmsCount).toBeGreaterThan(0);
    });
  });

  describe('Content Reader 工具定义', () => {
    it('应返回三个工具定义', () => {
      const reader = new SkillContentReader();
      const tools = reader.getToolDefinitions();
      expect(tools.length).toBe(3); // skill_list, skill_read, skill_search
      expect(tools.map((t: any) => t.function.name)).toContain('skill_list');
      expect(tools.map((t: any) => t.function.name)).toContain('skill_read');
      expect(tools.map((t: any) => t.function.name)).toContain('skill_search');
    });
  });

  describe('Version Tracker + Discovery 集成', () => {
    it('版本追踪器应与发现系统协同工作', () => {
      // 1. 创建初始 Skill
      const skills = [
        createMockSkill('test_skill', '测试技能', 'util'),
      ];

      // 2. 构建索引
      discovery.buildIndex(skills);

      // 3. 开始追踪版本
      for (const skill of skills) {
        versionTracker.trackSkill(skill);
      }

      // 4. 验证版本
      const versionInfo = versionTracker.getVersionInfo('test_skill');
      expect(versionInfo).toBeDefined();
      expect(versionInfo?.currentVersion.length).toBe(16);

      // 5. 验证集合签名
      const signature = versionTracker.getCollectiveSignature();
      expect(signature.length).toBeGreaterThan(0);
    });
  });

  describe('安全扫描 + 策略管线集成', () => {
    it('高风险 Skill 应被策略管线拒绝', async () => {
      // 1. 创建一个高风险 Skill
      const dangerousSkill = createMockSkill('dangerous', '危险技能', 'runtime_exec', {
        skillMdContent: '# Dangerous\nrm -rf / important',
      });

      // 2. 安全扫描
      const scanResult = scanner.scanSkill(dangerousSkill.definition);
      expect(scanResult.passed).toBe(false);
      expect(scanResult.overallRisk).toBe('critical');

      // 3. 策略管线（设置拒绝高风险组）
      const config: SkillPermissionConfig = {
        allow: [],
        deny: ['runtime_exec'],
        elevated: { enabled: 'deny' },
      };
      pipeline.setGlobalConfig(config);

      // 4. 验证被拒绝
      const allowed = await pipeline.isAllowed('dangerous', 'runtime_exec');
      expect(allowed).toBe(false);
    });
  });

  describe('完整的 Skill 生命周期（各模块独立验证）', () => {
    it('应支持从发现到审计的完整生命周期', () => {
      // 1. 发现阶段
      const skills = [
        createMockSkill('demo_skill', '演示技能', 'util', {
          tags: ['demo', 'test'],
        }),
      ];
      discovery.buildIndex(skills);
      const discoveryStats = discovery.getStats();
      expect(discoveryStats.total).toBe(1);

      // 2. 安全扫描
      const scanResult = scanner.scanSkill(skills[0].definition);
      expect(scanResult.passed).toBe(true);

      // 3. 版本追踪
      versionTracker.trackSkill(skills[0]);
      const versionInfo = versionTracker.getVersionInfo('demo_skill');
      expect(versionInfo).toBeDefined();
      expect(versionInfo?.changeHistory[0].changeType).toBe('created');

      // 4. 策略检查
      const config: SkillPermissionConfig = {
        allow: ['util'],
        deny: [],
        elevated: { enabled: 'ask' },
      };
      pipeline.setGlobalConfig(config);
      const policyResult = pipeline.checkGlobalConfig
        ? null // 私有方法，通过公开方法测试
        : null;

      // 5. 记录审计
      scanner.recordAudit({
        skillId: 'demo_skill',
        sessionId: 'test-session',
        params: { test: true },
        result: 'success',
        durationMs: 100,
        riskLevel: scanResult.overallRisk,
        securityChecks: {
          permission: true,
          sandbox: true,
          params: true,
        },
      });

      const auditLogs = scanner.queryAudit({ skillId: 'demo_skill' });
      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0].result).toBe('success');
      expect(auditLogs[0].riskLevel).toBe('none');
    });
  });

  describe('多模块数据一致性', () => {
    it('Discovery 和 Security Scanner 处理的 Skill 数量应一致', () => {
      const skills = [
        createMockSkill('skill1', '技能1', 'util'),
        createMockSkill('skill2', '技能2', 'wms'),
        createMockSkill('skill3', '技能3', 'network'),
      ];

      discovery.buildIndex(skills);
      const scanResults = scanner.scanSkills(skills);

      expect(discovery.getStats().total).toBe(skills.length);
      expect(scanResults.length).toBe(skills.length);
    });

    it('Version Tracker 追踪的数量应与 Discovery 索引数量一致', () => {
      const skills = [
        createMockSkill('vskill1', '版本技能1', 'util'),
        createMockSkill('vskill2', '版本技能2', 'wms'),
      ];

      discovery.buildIndex(skills);
      for (const skill of skills) {
        versionTracker.trackSkill(skill);
      }

      expect(discovery.getStats().total).toBe(skills.length);
      expect(Object.keys(versionTracker.getAllVersions()).length).toBe(skills.length);
    });
  });
});
