import { describe, it, expect } from 'vitest';
import {
  getProviderEnvVars,
  resolveProviderAuthLookupMaps,
} from '../_stub_parent__secrets__provider_env_vars.js';

describe('plugins/_stub_parent__secrets__provider_env_vars', () => {
  describe('getProviderEnvVars', () => {
    it('返回 anthropic 的候选 env vars', () => {
      const result = getProviderEnvVars('anthropic');
      expect(result).toContain('ANTHROPIC_OAUTH_TOKEN');
      expect(result).toContain('ANTHROPIC_API_KEY');
      expect(result.length).toBe(2);
    });

    it('返回 openai 的候选 env vars（含 CODEX_API_KEY 和 OPENAI_API_KEY）', () => {
      const result = getProviderEnvVars('openai');
      expect(result).toEqual(['CODEX_API_KEY', 'OPENAI_API_KEY']);
    });

    it('返回 voyage 的候选 env vars', () => {
      const result = getProviderEnvVars('voyage');
      expect(result).toEqual(['VOYAGE_API_KEY']);
    });

    it('返回 cerebras 的候选 env vars', () => {
      const result = getProviderEnvVars('cerebras');
      expect(result).toEqual(['CEREBRAS_API_KEY']);
    });

    it('返回 qwen-dashscope 的候选 env vars', () => {
      const result = getProviderEnvVars('qwen-dashscope');
      expect(result).toEqual(['DASHSCOPE_API_KEY']);
    });

    it('返回 minimax 与 minimax-cn 共享同一 env var', () => {
      expect(getProviderEnvVars('minimax')).toEqual(['MINIMAX_API_KEY']);
      expect(getProviderEnvVars('minimax-cn')).toEqual(['MINIMAX_API_KEY']);
    });

    it('返回 anthropic-openai 的候选 env vars', () => {
      const result = getProviderEnvVars('anthropic-openai');
      expect(result).toEqual(['ANTHROPIC_API_KEY']);
    });

    it('未知 provider 返回空数组', () => {
      expect(getProviderEnvVars('unknown-provider')).toEqual([]);
      expect(getProviderEnvVars('')).toEqual([]);
    });

    it('返回的数组是只读的（readonly string[]）', () => {
      const result = getProviderEnvVars('anthropic');
      expect(Array.isArray(result)).toBe(true);
      expect(Object.isFrozen(result)).toBe(false);
    });

    it('接受可选 params 参数但不影响结果', () => {
      const withoutParams = getProviderEnvVars('openai');
      const withParams = getProviderEnvVars('openai', {
        config: { foo: 'bar' },
        workspaceDir: '/tmp',
        env: { OPENAI_API_KEY: 'sk-test' },
        includeUntrustedWorkspacePlugins: true,
        metadataSnapshot: { plugins: [] },
      });
      expect(withoutParams).toEqual(withParams);
    });

    it('不读取真实 env，仅返回候选列表', () => {
      const before = getProviderEnvVars('voyage');
      process.env.VOYAGE_API_KEY = 'sk-test-value';
      const after = getProviderEnvVars('voyage');
      expect(after).toEqual(before);
      delete process.env.VOYAGE_API_KEY;
    });
  });

  describe('resolveProviderAuthLookupMaps', () => {
    it('返回 aliasMap 为空对象', () => {
      const maps = resolveProviderAuthLookupMaps();
      expect(maps.aliasMap).toEqual({});
    });

    it('返回 authEvidenceMap 为空对象', () => {
      const maps = resolveProviderAuthLookupMaps();
      expect(maps.authEvidenceMap).toEqual({});
    });

    it('返回 setupProviderFallbackRefs 为空数组', () => {
      const maps = resolveProviderAuthLookupMaps();
      expect(maps.setupProviderFallbackRefs).toEqual([]);
    });

    it('返回 envCandidateMap 包含所有 core providers', () => {
      const maps = resolveProviderAuthLookupMaps();
      expect(maps.envCandidateMap.anthropic).toContain('ANTHROPIC_API_KEY');
      expect(maps.envCandidateMap.openai).toContain('OPENAI_API_KEY');
      expect(maps.envCandidateMap.voyage).toEqual(['VOYAGE_API_KEY']);
    });

    it('多次调用返回独立但等价的对象', () => {
      const a = resolveProviderAuthLookupMaps();
      const b = resolveProviderAuthLookupMaps();
      expect(a.envCandidateMap).toEqual(b.envCandidateMap);
      expect(a).not.toBe(b);
    });

    it('接受可选 params 参数但不影响结果', () => {
      const withoutParams = resolveProviderAuthLookupMaps();
      const withParams = resolveProviderAuthLookupMaps({
        config: { x: 1 },
        env: { FOO: 'bar' },
      });
      expect(withoutParams).toEqual(withParams);
    });
  });
});
