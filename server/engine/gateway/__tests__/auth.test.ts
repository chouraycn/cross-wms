// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock 外部依赖：checkSkillPermission 依赖文件系统与 logger
vi.mock('../../skills/security/permission.js', () => ({
  checkSkillPermission: vi.fn(() => ({ allowed: true, reason: 'allowed' })),
}));

// Mock logger 以避免日志副作用
vi.mock('../../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    })),
  },
}));

import {
  authorizeTokenAuth,
  authorizePasswordAuth,
  authorizeTrustedProxy,
  authorizeGatewayConnect,
  authorizeHttpGatewayConnect,
  authorizeWsControlUiGatewayConnect,
  assertGatewayAuthConfigured,
  checkSkillAccess,
  createSkillAccessMiddleware,
  authorizeSkillOperation,
} from '../auth.js';
import { checkSkillPermission } from '../../skills/security/permission.js';

const mockedCheckSkillPermission = vi.mocked(checkSkillPermission);

describe('gateway auth 授权函数', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckSkillPermission.mockReturnValue({ allowed: true, reason: 'allowed' });
  });

  describe('authorizeTokenAuth', () => {
    it('未配置 token 时应失败并给出原因', () => {
      const result = authorizeTokenAuth('provided', undefined);
      expect(result.ok).toBe(false);
      expect(result.method).toBe('token');
      expect(result.reason).toBe('no token configured');
    });

    it('未提供 token 时应失败', () => {
      const result = authorizeTokenAuth(undefined, 'expected');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('no token provided');
    });

    it('token 不匹配时应失败', () => {
      const result = authorizeTokenAuth('wrong', 'expected');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid token');
    });

    it('token 匹配时应成功', () => {
      const result = authorizeTokenAuth('secret', 'secret');
      expect(result.ok).toBe(true);
      expect(result.method).toBe('token');
    });

    it('长度不同的 token 应失败（短路）', () => {
      const result = authorizeTokenAuth('short', 'much-longer-token');
      expect(result.ok).toBe(false);
    });
  });

  describe('authorizePasswordAuth', () => {
    it('未配置 password 时应失败', () => {
      const result = authorizePasswordAuth('p', undefined);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('no password configured');
    });

    it('未提供 password 时应失败', () => {
      const result = authorizePasswordAuth(undefined, 'expected');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('no password provided');
    });

    it('password 不匹配时应失败', () => {
      const result = authorizePasswordAuth('wrong', 'expected');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid password');
    });

    it('password 匹配时应成功', () => {
      const result = authorizePasswordAuth('hunter2', 'hunter2');
      expect(result.ok).toBe(true);
      expect(result.method).toBe('password');
    });
  });

  describe('authorizeTrustedProxy', () => {
    it('clientIp 不在 trustedProxies 列表中应失败', () => {
      const result = authorizeTrustedProxy('8.8.8.8', ['10.0.0.1']);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('not a trusted proxy');
    });

    it('clientIp 在 trustedProxies 列表中应成功', () => {
      const result = authorizeTrustedProxy('10.0.0.1', ['10.0.0.1']);
      expect(result.ok).toBe(true);
      expect(result.method).toBe('trusted-proxy');
    });

    it('成功时应返回 forwardedUser 作为 user', () => {
      const result = authorizeTrustedProxy('10.0.0.1', ['10.0.0.1'], 'alice');
      expect(result.ok).toBe(true);
      expect(result.user).toBe('alice');
    });
  });

  describe('authorizeGatewayConnect', () => {
    it('none 模式应直接成功', async () => {
      const result = await authorizeGatewayConnect({
        auth: { mode: 'none', allowTailscale: false },
        req: { headers: {} } as any,
        authSurface: 'http',
      });
      expect(result.ok).toBe(true);
      expect(result.method).toBe('none');
    });

    it('token 模式应匹配 connectAuth token', async () => {
      const result = await authorizeGatewayConnect({
        auth: { mode: 'token', token: 'mytoken', allowTailscale: false },
        connectAuth: { token: 'mytoken' },
        req: { headers: {} } as any,
        authSurface: 'http',
      });
      expect(result.ok).toBe(true);
      expect(result.method).toBe('token');
    });

    it('token 不匹配时应失败', async () => {
      const result = await authorizeGatewayConnect({
        auth: { mode: 'token', token: 'mytoken', allowTailscale: false },
        connectAuth: { token: 'wrong' },
        req: { headers: {} } as any,
        authSurface: 'http',
      });
      expect(result.ok).toBe(false);
    });

    it('password 模式应匹配 connectAuth password', async () => {
      const result = await authorizeGatewayConnect({
        auth: { mode: 'password', password: 'secret', allowTailscale: false },
        connectAuth: { password: 'secret' },
        req: { headers: {} } as any,
        authSurface: 'http',
      });
      expect(result.ok).toBe(true);
      expect(result.method).toBe('password');
    });

    it('trusted-proxy 模式无 req 时应失败', async () => {
      const result = await authorizeGatewayConnect({
        auth: {
          mode: 'trusted-proxy',
          allowTailscale: false,
          trustedProxy: { userHeader: 'x-forwarded-user' },
        },
        trustedProxies: ['10.0.0.1'],
        authSurface: 'http',
      });
      expect(result.ok).toBe(false);
    });

    it('trusted-proxy 模式可信代理时应成功并使用 forwarded user', async () => {
      const result = await authorizeGatewayConnect({
        auth: {
          mode: 'trusted-proxy',
          allowTailscale: false,
          trustedProxy: { userHeader: 'x-forwarded-user', allowLoopback: true },
        },
        trustedProxies: ['127.0.0.1'],
        req: {
          headers: { 'x-forwarded-user': 'bob' },
          socket: { remoteAddress: '127.0.0.1' },
        } as any,
        authSurface: 'http',
      });
      expect(result.ok).toBe(true);
      expect(result.user).toBe('bob');
    });

    it('未知 auth mode 时应失败', async () => {
      const result = await authorizeGatewayConnect({
        auth: { mode: 'unknown-mode' as any, allowTailscale: false },
        req: { headers: {} } as any,
        authSurface: 'http',
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('authorizeHttpGatewayConnect / authorizeWsControlUiGatewayConnect', () => {
    it('http 表面应成功授权 none 模式', async () => {
      const result = await authorizeHttpGatewayConnect({
        auth: { mode: 'none', allowTailscale: false },
        req: { headers: {} } as any,
      });
      expect(result.ok).toBe(true);
    });

    it('ws-control-ui 表面应成功授权 none 模式', async () => {
      const result = await authorizeWsControlUiGatewayConnect({
        auth: { mode: 'none', allowTailscale: false },
        req: { headers: {} } as any,
      });
      expect(result.ok).toBe(true);
    });

    it('http 表面 token 模式应匹配 token', async () => {
      const result = await authorizeHttpGatewayConnect({
        auth: { mode: 'token', token: 't', allowTailscale: false },
        connectAuth: { token: 't' },
        req: { headers: {} } as any,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('assertGatewayAuthConfigured', () => {
    it('none 模式不应抛出', () => {
      expect(() => assertGatewayAuthConfigured({ mode: 'none' })).not.toThrow();
    });

    it('token 模式无 token 时应抛出', () => {
      expect(() => assertGatewayAuthConfigured({ mode: 'token' })).toThrow(
        /no token was configured/,
      );
    });

    it('token 模式有 token 时不应抛出', () => {
      expect(() => assertGatewayAuthConfigured({ mode: 'token', token: 't' })).not.toThrow();
    });

    it('password 模式无 password 时应抛出', () => {
      expect(() => assertGatewayAuthConfigured({ mode: 'password' })).toThrow(
        /no password was configured/,
      );
    });

    it('password 模式有 password 时不应抛出', () => {
      expect(() => assertGatewayAuthConfigured({ mode: 'password', password: 'p' })).not.toThrow();
    });

    it('未提供 mode 时应默认为 none 不抛出', () => {
      expect(() => assertGatewayAuthConfigured({})).not.toThrow();
    });
  });

  describe('checkSkillAccess', () => {
    it('checkSkillPermission 允许时应返回 allowed:true', () => {
      mockedCheckSkillPermission.mockReturnValue({ allowed: true, reason: 'ok' });
      const result = checkSkillAccess('skillA', 'execute', 'admin');
      expect(result.allowed).toBe(true);
    });

    it('checkSkillPermission 拒绝时应返回 allowed:false 并附带 reason', () => {
      mockedCheckSkillPermission.mockReturnValue({ allowed: false, reason: 'denied by rule' });
      const result = checkSkillAccess('skillA', 'execute', 'user');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('denied by rule');
    });

    it('应将参数透传给 checkSkillPermission', () => {
      mockedCheckSkillPermission.mockReturnValue({ allowed: true, reason: 'ok' });
      checkSkillAccess('skillB', 'install', 'operator');
      expect(mockedCheckSkillPermission).toHaveBeenCalledWith('skillB', 'install', 'operator');
    });
  });

  describe('createSkillAccessMiddleware', () => {
    it('应返回一个检查函数', () => {
      const middleware = createSkillAccessMiddleware({
        skillName: 'skillA',
        action: 'execute',
        userRole: 'admin',
      });
      expect(typeof middleware).toBe('function');
    });

    it('middleware 在 checkSkillPermission 允许时应返回 allowed:true', () => {
      mockedCheckSkillPermission.mockReturnValue({ allowed: true, reason: 'ok' });
      const middleware = createSkillAccessMiddleware({
        skillName: 'skillA',
        action: 'execute',
        userRole: 'admin',
      });
      const result = middleware({});
      expect(result.allowed).toBe(true);
    });

    it('middleware 在 checkSkillPermission 拒绝时应返回 allowed:false', () => {
      mockedCheckSkillPermission.mockReturnValue({ allowed: false, reason: 'no' });
      const middleware = createSkillAccessMiddleware({
        skillName: 'skillA',
        action: 'execute',
      });
      const result = middleware({});
      expect(result.allowed).toBe(false);
    });

    it('未提供 userRole 时应默认 "user"', () => {
      mockedCheckSkillPermission.mockReturnValue({ allowed: true, reason: 'ok' });
      const middleware = createSkillAccessMiddleware({
        skillName: 'skillA',
        action: 'read',
      });
      middleware({});
      expect(mockedCheckSkillPermission).toHaveBeenCalledWith('skillA', 'read', 'user');
    });
  });

  describe('authorizeSkillOperation', () => {
    it('允许时应返回 ok:true 并附带 user', () => {
      mockedCheckSkillPermission.mockReturnValue({ allowed: true, reason: 'ok' });
      const result = authorizeSkillOperation('skillA', 'execute', 'admin');
      expect(result.ok).toBe(true);
      expect(result.method).toBe('token');
      expect(result.user).toBe('admin');
    });

    it('拒绝时应返回 ok:false 并附带 reason', () => {
      mockedCheckSkillPermission.mockReturnValue({ allowed: false, reason: 'denied' });
      const result = authorizeSkillOperation('skillA', 'execute', 'user');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('denied');
    });
  });
});
