// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  normalizeAuthConfig,
  validateAuthConfig,
  getAuthMethodDescription,
  mergeAuthConfigs,
  authResultToHttpStatus,
} from '../auth-config-utils.js';

describe('auth-config-utils', () => {
  describe('normalizeAuthConfig', () => {
    it('空配置应默认为 none 模式', () => {
      const result = normalizeAuthConfig(undefined);
      expect(result.mode).toBe('none');
      expect(result.hasCredentials).toBe(false);
      expect(result.isSecure).toBe(false);
    });

    it('应填充默认值', () => {
      const result = normalizeAuthConfig({ mode: 'none' });
      expect(result.trustedProxies).toEqual([]);
      expect(result.allowInsecure).toBe(false);
      expect(result.requireHttps).toBe(false);
      expect(result.sessionTimeoutMs).toBe(86400000);
      expect(result.maxFailedAttempts).toBe(5);
      expect(result.lockoutDurationMs).toBe(900000);
    });

    it('token 模式且有 token 时 hasCredentials 应为 true', () => {
      const result = normalizeAuthConfig({ mode: 'token', token: 'abc' });
      expect(result.hasCredentials).toBe(true);
      expect(result.isSecure).toBe(true);
    });

    it('token 模式且有 tokenHash 时 hasCredentials 应为 true', () => {
      const result = normalizeAuthConfig({ mode: 'token', tokenHash: 'hash' });
      expect(result.hasCredentials).toBe(true);
    });

    it('token 模式但无 token/tokenHash 时 hasCredentials 应为 false', () => {
      const result = normalizeAuthConfig({ mode: 'token' });
      expect(result.hasCredentials).toBe(false);
      expect(result.isSecure).toBe(false);
    });

    it('password 模式且有 password 时 hasCredentials 应为 true', () => {
      const result = normalizeAuthConfig({ mode: 'password', password: 'secret' });
      expect(result.hasCredentials).toBe(true);
    });

    it('password 模式且有 passwordHash 时 hasCredentials 应为 true', () => {
      const result = normalizeAuthConfig({ mode: 'password', passwordHash: 'hash' });
      expect(result.hasCredentials).toBe(true);
    });

    it('trusted-proxy 模式 hasCredentials 应为 true', () => {
      const result = normalizeAuthConfig({ mode: 'trusted-proxy', trustedProxies: ['10.0.0.1'] });
      expect(result.hasCredentials).toBe(true);
      expect(result.isSecure).toBe(true);
    });

    it('tailscale 模式 hasCredentials 应为 true', () => {
      const result = normalizeAuthConfig({ mode: 'tailscale' });
      expect(result.hasCredentials).toBe(true);
    });

    it('trustedProxies 未提供时应默认为空数组', () => {
      const result = normalizeAuthConfig({ mode: 'trusted-proxy' });
      expect(result.trustedProxies).toEqual([]);
    });

    it('应保留用户提供的自定义值', () => {
      const result = normalizeAuthConfig({
        mode: 'token',
        token: 't',
        allowInsecure: true,
        requireHttps: false,
        sessionTimeoutMs: 1000,
        maxFailedAttempts: 3,
        lockoutDurationMs: 5000,
      });
      expect(result.allowInsecure).toBe(true);
      expect(result.sessionTimeoutMs).toBe(1000);
      expect(result.maxFailedAttempts).toBe(3);
      expect(result.lockoutDurationMs).toBe(5000);
    });
  });

  describe('validateAuthConfig', () => {
    it('none 模式应为有效', () => {
      const result = validateAuthConfig({ mode: 'none' });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('token 模式无 token/tokenHash 应报错', () => {
      const result = validateAuthConfig({ mode: 'token' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('token auth mode requires token or tokenHash');
    });

    it('token 模式有 token 应有效', () => {
      const result = validateAuthConfig({ mode: 'token', token: 'abc' });
      expect(result.valid).toBe(true);
    });

    it('password 模式无 password/passwordHash 应报错', () => {
      const result = validateAuthConfig({ mode: 'password' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('password auth mode requires password or passwordHash');
    });

    it('password 模式有 password 应有效', () => {
      const result = validateAuthConfig({ mode: 'password', password: 'p' });
      expect(result.valid).toBe(true);
    });

    it('trusted-proxy 模式无 trustedProxies 应报错', () => {
      const result = validateAuthConfig({ mode: 'trusted-proxy' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('trusted-proxy auth mode requires at least one trusted proxy');
    });

    it('trusted-proxy 模式有 trustedProxies 应有效', () => {
      const result = validateAuthConfig({ mode: 'trusted-proxy', trustedProxies: ['10.0.0.1'] });
      expect(result.valid).toBe(true);
    });

    it('requireHttps 与 allowInsecure 同时为 true 应报错', () => {
      const result = validateAuthConfig({
        mode: 'none',
        requireHttps: true,
        allowInsecure: true,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('requireHttps and allowInsecure cannot both be true');
    });
  });

  describe('getAuthMethodDescription', () => {
    it('none 应返回 "No authentication required"', () => {
      expect(getAuthMethodDescription('none')).toBe('No authentication required');
    });

    it('token 应返回 "Bearer token authentication"', () => {
      expect(getAuthMethodDescription('token')).toBe('Bearer token authentication');
    });

    it('password 应返回 "Password authentication"', () => {
      expect(getAuthMethodDescription('password')).toBe('Password authentication');
    });

    it('trusted-proxy 应返回 "Trusted proxy authentication"', () => {
      expect(getAuthMethodDescription('trusted-proxy')).toBe('Trusted proxy authentication');
    });

    it('tailscale 应返回 "Tailscale authentication"', () => {
      expect(getAuthMethodDescription('tailscale')).toBe('Tailscale authentication');
    });

    it('未知模式应返回 "Unknown authentication method"', () => {
      expect(getAuthMethodDescription('custom' as never)).toBe('Unknown authentication method');
    });
  });

  describe('mergeAuthConfigs', () => {
    it('应合并 base 与 override', () => {
      const result = mergeAuthConfigs({ mode: 'none' }, { mode: 'token', token: 't' });
      expect(result.mode).toBe('token');
      expect(result.token).toBe('t');
    });

    it('override 应覆盖 base 同名字段', () => {
      const result = mergeAuthConfigs({ mode: 'token', token: 'old' }, { token: 'new' });
      expect(result.token).toBe('new');
    });

    it('trustedProxies 应合并而非覆盖', () => {
      const result = mergeAuthConfigs(
        { mode: 'trusted-proxy', trustedProxies: ['10.0.0.1'] },
        { trustedProxies: ['10.0.0.2'] },
      );
      expect(result.trustedProxies).toEqual(['10.0.0.1', '10.0.0.2']);
    });

    it('base 与 override 均未提供 trustedProxies 时应为空数组', () => {
      const result = mergeAuthConfigs({ mode: 'none' }, { mode: 'none' });
      expect(result.trustedProxies).toEqual([]);
    });

    it('返回应为已规范化配置', () => {
      const result = mergeAuthConfigs({ mode: 'none' }, { mode: 'token', token: 't' });
      expect(result.isSecure).toBe(true);
      expect(result.hasCredentials).toBe(true);
    });
  });

  describe('authResultToHttpStatus', () => {
    it('成功结果应映射到 200', () => {
      expect(authResultToHttpStatus({ ok: true, method: 'token' })).toBe(200);
    });

    it('rateLimited 结果应映射到 429', () => {
      expect(
        authResultToHttpStatus({ ok: false, method: 'token', rateLimited: true }),
      ).toBe(429);
    });

    it('普通失败结果应映射到 401', () => {
      expect(
        authResultToHttpStatus({ ok: false, method: 'token', reason: 'invalid' }),
      ).toBe(401);
    });
  });
});
