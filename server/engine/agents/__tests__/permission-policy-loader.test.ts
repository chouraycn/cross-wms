import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  POLICY_TEMPLATES,
  applyTemplate,
  resolvePolicy,
  loadPolicyFile,
  loadPolicies,
  loadPoliciesFromFile,
  validatePolicyInputs,
  listLoadedPolicies,
  listTemplates,
  permissionPolicyLoader,
  type PolicyConfigInput,
} from '../permission-policy-loader.js';
import { permissionPolicyEngine } from '../permission-policy-engine.js';
import { agentAuditTrail } from '../agent-audit-trail.js';

describe('permission-policy-loader', () => {
  const testAgentIds = ['agent-test-1', 'agent-test-2', 'agent-test-3'];

  beforeEach(() => {
    for (const id of testAgentIds) {
      permissionPolicyEngine.clearPolicy(id);
    }
    agentAuditTrail.clear();
  });

  afterEach(() => {
    for (const id of testAgentIds) {
      permissionPolicyEngine.clearPolicy(id);
    }
    agentAuditTrail.clear();
  });

  describe('POLICY_TEMPLATES', () => {
    it('应定义 4 种模板', () => {
      expect(Object.keys(POLICY_TEMPLATES).sort()).toEqual([
        'permissive',
        'readonly',
        'standard',
        'strict',
      ]);
    });

    it('strict 模板应拒绝危险权限', () => {
      expect(POLICY_TEMPLATES.strict.denied).toContain('exec.shell');
      expect(POLICY_TEMPLATES.strict.denied).toContain('file.write');
      expect(POLICY_TEMPLATES.strict.denied).toContain('subagent.spawn');
    });

    it('readonly 模板应只允许读取权限', () => {
      expect(POLICY_TEMPLATES.readonly.allowed).toContain('file.read');
      expect(POLICY_TEMPLATES.readonly.allowed).toContain('memory.read');
      expect(POLICY_TEMPLATES.readonly.denied).toContain('file.write');
    });

    it('permissive 模板应允许大部分权限', () => {
      expect(POLICY_TEMPLATES.permissive.allowed).toContain('file.write');
      expect(POLICY_TEMPLATES.permissive.allowed).toContain('network.write');
      expect(POLICY_TEMPLATES.permissive.denied).toHaveLength(0);
    });
  });

  describe('applyTemplate', () => {
    it('应返回模板的副本（不共享引用）', () => {
      const t1 = applyTemplate('strict');
      const t2 = applyTemplate('strict');
      expect(t1).not.toBe(t2);
      expect(t1.allowed).toEqual(t2.allowed);
      t1.allowed.push('file.write');
      expect(t2.allowed).not.toContain('file.write');
    });
  });

  describe('resolvePolicy', () => {
    it('无 agentId 时应返回 undefined', () => {
      const result = resolvePolicy({ allowed: ['file.read'] } as PolicyConfigInput);
      expect(result).toBeUndefined();
    });

    it('仅内联 allowed 时应使用空 base', () => {
      const result = resolvePolicy({
        agentId: 'agent-test-1',
        allowed: ['file.read', 'tool.use'],
      });
      expect(result).toBeDefined();
      expect(result!.agentId).toBe('agent-test-1');
      expect(result!.allowed).toContain('file.read');
      expect(result!.allowed).toContain('tool.use');
      expect(result!.denied).toEqual([]);
    });

    it('使用模板时应继承模板的 denied/requireApproval', () => {
      const result = resolvePolicy({
        agentId: 'agent-test-1',
        template: 'strict',
      });
      expect(result!.denied).toContain('exec.shell');
      expect(result!.requireApproval).toContain('tool.use');
    });

    it('模板 + 显式 allowed 应合并去重', () => {
      const result = resolvePolicy({
        agentId: 'agent-test-1',
        template: 'standard',
        allowed: ['file.read', 'network.read'],
      });
      // file.read 来自模板，network.read 是新增
      expect(result!.allowed).toContain('file.read');
      expect(result!.allowed).toContain('network.read');
      // 去重：file.read 不应出现两次
      expect(result!.allowed.filter((p) => p === 'file.read')).toHaveLength(1);
    });

    it('denied 中的权限应从 allowed 中移除', () => {
      const result = resolvePolicy({
        agentId: 'agent-test-1',
        template: 'permissive',
        denied: ['file.write'],
      });
      // permissive 默认 allowed 中包含 file.write
      expect(result!.allowed).not.toContain('file.write');
      expect(result!.denied).toContain('file.write');
    });

    it('requireApproval 中的权限应从 allowed/denied 中移除', () => {
      const result = resolvePolicy({
        agentId: 'agent-test-1',
        template: 'permissive',
        requireApproval: ['network.write'],
      });
      expect(result!.allowed).not.toContain('network.write');
      expect(result!.denied).not.toContain('network.write');
      expect(result!.requireApproval).toContain('network.write');
    });

    it('未知模板时应使用空 base', () => {
      const result = resolvePolicy({
        agentId: 'agent-test-1',
        template: 'unknown' as never,
      });
      expect(result).toBeDefined();
      expect(result!.allowed).toEqual([]);
    });
  });

  describe('loadPolicyFile', () => {
    it('应能加载数组格式 JSON', () => {
      const tmp = path.join(os.tmpdir(), `pol-${Date.now()}.json`);
      const inputs: PolicyConfigInput[] = [
        { agentId: 'agent-test-1', template: 'strict' },
      ];
      fs.writeFileSync(tmp, JSON.stringify(inputs), 'utf-8');
      const result = loadPolicyFile(tmp);
      expect(result).toHaveLength(1);
      expect(result[0].agentId).toBe('agent-test-1');
      fs.unlinkSync(tmp);
    });

    it('应能加载 { policies: [...] } 格式 JSON', () => {
      const tmp = path.join(os.tmpdir(), `pol-${Date.now()}.json`);
      fs.writeFileSync(
        tmp,
        JSON.stringify({ policies: [{ agentId: 'agent-test-1' }] }),
        'utf-8',
      );
      const result = loadPolicyFile(tmp);
      expect(result).toHaveLength(1);
      fs.unlinkSync(tmp);
    });

    it('文件不存在时应返回空数组', () => {
      const result = loadPolicyFile('/nonexistent/path/to/file.json');
      expect(result).toEqual([]);
    });

    it('JSON 格式错误时应返回空数组', () => {
      const tmp = path.join(os.tmpdir(), `pol-${Date.now()}.json`);
      fs.writeFileSync(tmp, '{ invalid', 'utf-8');
      const result = loadPolicyFile(tmp);
      expect(result).toEqual([]);
      fs.unlinkSync(tmp);
    });
  });

  describe('loadPolicies', () => {
    it('应能批量加载策略到 engine', () => {
      const result = loadPolicies([
        { agentId: 'agent-test-1', template: 'strict' },
        { agentId: 'agent-test-2', template: 'permissive' },
      ]);
      expect(result.loaded).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.policies).toHaveLength(2);

      const policy1 = permissionPolicyEngine.getPolicy('agent-test-1');
      expect(policy1).toBeDefined();
      expect(policy1!.denied).toContain('exec.shell');
    });

    it('缺少 agentId 时应跳过', () => {
      const result = loadPolicies([
        { template: 'strict' } as PolicyConfigInput,
        { agentId: 'agent-test-1', template: 'strict' },
      ]);
      expect(result.loaded).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('agentId');
    });

    it('启用 audit 时应记录到 agentAuditTrail', () => {
      loadPolicies([{ agentId: 'agent-test-1', template: 'strict' }], { audit: true });
      const result = agentAuditTrail.query({ category: 'permission', limit: 10 });
      expect(result.events.length).toBeGreaterThan(0);
      const found = result.events.find((e) => e.type === 'policy.loaded');
      expect(found).toBeDefined();
      expect(found!.agentId).toBe('agent-test-1');
    });

    it('禁用 audit 时不应记录', () => {
      loadPolicies([{ agentId: 'agent-test-1', template: 'strict' }], { audit: false });
      const result = agentAuditTrail.query({ category: 'permission', limit: 10 });
      expect(result.events.length).toBe(0);
    });

    it('引用 file 时应合并文件内容', () => {
      const tmp = path.join(os.tmpdir(), `pol-${Date.now()}.json`);
      fs.writeFileSync(
        tmp,
        JSON.stringify([{ agentId: 'agent-test-1', allowed: ['memory.write'] }]),
        'utf-8',
      );
      const result = loadPolicies([
        { agentId: 'agent-test-1', template: 'strict', file: tmp },
      ]);
      expect(result.loaded).toBe(1);
      const policy = permissionPolicyEngine.getPolicy('agent-test-1');
      // 来自文件的 allowed
      expect(policy!.allowed).toContain('memory.write');
      // 来自模板的 denied
      expect(policy!.denied).toContain('exec.shell');
      fs.unlinkSync(tmp);
    });
  });

  describe('loadPoliciesFromFile', () => {
    it('文件不存在时应返回 0 loaded', () => {
      const result = loadPoliciesFromFile('/nonexistent/path.json');
      expect(result.loaded).toBe(0);
      expect(result.policies).toEqual([]);
    });

    it('应能从文件加载并应用到 engine', () => {
      const tmp = path.join(os.tmpdir(), `pol-${Date.now()}.json`);
      fs.writeFileSync(
        tmp,
        JSON.stringify([{ agentId: 'agent-test-1', template: 'readonly' }]),
        'utf-8',
      );
      const result = loadPoliciesFromFile(tmp);
      expect(result.loaded).toBe(1);
      const policy = permissionPolicyEngine.getPolicy('agent-test-1');
      expect(policy!.allowed).toContain('file.read');
      expect(policy!.denied).toContain('file.write');
      fs.unlinkSync(tmp);
    });
  });

  describe('validatePolicyInputs', () => {
    it('合法输入应通过验证', () => {
      const result = validatePolicyInputs([
        { agentId: 'agent-test-1', template: 'strict' },
      ]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.resolved).toHaveLength(1);
    });

    it('缺少 agentId 应报错', () => {
      const result = validatePolicyInputs([{} as PolicyConfigInput]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('agentId'))).toBe(true);
    });

    it('未知模板应报错', () => {
      const result = validatePolicyInputs([
        { agentId: 'agent-test-1', template: 'unknown' as never },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Unknown template'))).toBe(true);
    });

    it('未知权限应报错', () => {
      const result = validatePolicyInputs([
        { agentId: 'agent-test-1', allowed: ['unknown.permission' as never] },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Unknown permission'))).toBe(true);
    });

    it('同一权限同时出现在 allowed 和 denied 应报错', () => {
      const result = validatePolicyInputs([
        {
          agentId: 'agent-test-1',
          allowed: ['file.read'],
          denied: ['file.read'],
        },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('both allowed and denied'))).toBe(true);
    });

    it('同一权限同时出现在 allowed 和 requireApproval 应报错', () => {
      const result = validatePolicyInputs([
        {
          agentId: 'agent-test-1',
          allowed: ['file.read'],
          requireApproval: ['file.read'],
        },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('both allowed and requireApproval'))).toBe(true);
    });
  });

  describe('listLoadedPolicies / listTemplates', () => {
    beforeEach(() => {
      loadPolicies([
        { agentId: 'agent-test-1', template: 'strict' },
        { agentId: 'agent-test-2', template: 'permissive' },
      ]);
    });

    it('listLoadedPolicies 应返回已加载的策略', () => {
      const list = listLoadedPolicies();
      const ids = list.map((p) => p.agentId);
      expect(ids).toContain('agent-test-1');
      expect(ids).toContain('agent-test-2');
    });

    it('listTemplates 应返回所有 4 种模板', () => {
      const templates = listTemplates();
      expect(templates).toHaveLength(4);
      const names = templates.map((t) => t.name).sort();
      expect(names).toEqual(['permissive', 'readonly', 'standard', 'strict']);
    });
  });

  describe('permissionPolicyLoader 单例', () => {
    it('应暴露所有公共 API', () => {
      expect(typeof permissionPolicyLoader.loadPolicies).toBe('function');
      expect(typeof permissionPolicyLoader.loadPoliciesFromFile).toBe('function');
      expect(typeof permissionPolicyLoader.validatePolicyInputs).toBe('function');
      expect(typeof permissionPolicyLoader.resolvePolicy).toBe('function');
      expect(typeof permissionPolicyLoader.applyTemplate).toBe('function');
      expect(typeof permissionPolicyLoader.listLoadedPolicies).toBe('function');
      expect(typeof permissionPolicyLoader.listTemplates).toBe('function');
    });
  });
});
