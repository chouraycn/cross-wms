// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  normalizeRateLimitClientIp,
  clampConnectChallengeTimeoutMs,
  getConnectChallengeTimeoutMsFromEnv,
  getPreauthHandshakeTimeoutMsFromEnv,
  resolveConnectChallengeTimeoutMs,
  resolvePreauthHandshakeTimeoutMs,
  DEFAULT_PREAUTH_HANDSHAKE_TIMEOUT_MS,
  MIN_CONNECT_CHALLENGE_TIMEOUT_MS,
  MAX_CONNECT_CHALLENGE_TIMEOUT_MS,
  SILENT_REPLY_TOKEN,
  isSilentReplyText,
  trimToUndefined,
  describeFailoverError,
  resolveFailoverStatus,
  isLoopbackHost,
  resolveHostName,
  isValidIPv4,
  isPrivateOrLoopbackIpAddress,
  isIpv6Address,
  parseCanonicalIpAddress,
  getPluginRegistryState,
  resolveReservedGatewayMethodScope,
} from '../_openclaw-stubs.js';

describe('_openclaw-stubs 工具函数', () => {
  describe('normalizeRateLimitClientIp', () => {
    it('应保留非空字符串并去除空白', () => {
      expect(normalizeRateLimitClientIp('  1.2.3.4  ')).toBe('1.2.3.4');
    });

    it('空字符串应归一为 unknown', () => {
      expect(normalizeRateLimitClientIp('')).toBe('unknown');
    });

    it('纯空白应归一为 unknown', () => {
      expect(normalizeRateLimitClientIp('   ')).toBe('unknown');
    });

    it('undefined 应归一为 unknown', () => {
      expect(normalizeRateLimitClientIp(undefined)).toBe('unknown');
    });
  });

  describe('clampConnectChallengeTimeoutMs', () => {
    it('应在区间内保留原值', () => {
      expect(clampConnectChallengeTimeoutMs(20_000)).toBe(20_000);
    });

    it('应向下取整', () => {
      expect(clampConnectChallengeTimeoutMs(20_500.9)).toBe(20_500);
    });

    it('低于最小值应夹到最小值', () => {
      expect(clampConnectChallengeTimeoutMs(100)).toBe(MIN_CONNECT_CHALLENGE_TIMEOUT_MS);
    });

    it('高于最大值应夹到最大值', () => {
      expect(clampConnectChallengeTimeoutMs(999_999)).toBe(MAX_CONNECT_CHALLENGE_TIMEOUT_MS);
    });
  });

  describe('getConnectChallengeTimeoutMsFromEnv', () => {
    it('env 未设置时应返回默认值', () => {
      expect(getConnectChallengeTimeoutMsFromEnv({})).toBe(DEFAULT_PREAUTH_HANDSHAKE_TIMEOUT_MS);
    });

    it('env 合法数字时应返回夹取后的值', () => {
      expect(
        getConnectChallengeTimeoutMsFromEnv({ OPENCLAW_GATEWAY_CONNECT_CHALLENGE_TIMEOUT_MS: '20000' }),
      ).toBe(20_000);
    });

    it('env 非法值应回退到默认值', () => {
      expect(
        getConnectChallengeTimeoutMsFromEnv({ OPENCLAW_GATEWAY_CONNECT_CHALLENGE_TIMEOUT_MS: 'not-a-number' }),
      ).toBe(DEFAULT_PREAUTH_HANDSHAKE_TIMEOUT_MS);
    });

    it('env 过大值应被夹到最大值', () => {
      expect(
        getConnectChallengeTimeoutMsFromEnv({ OPENCLAW_GATEWAY_CONNECT_CHALLENGE_TIMEOUT_MS: '999999' }),
      ).toBe(MAX_CONNECT_CHALLENGE_TIMEOUT_MS);
    });

    it('env 负数应回退到默认值', () => {
      expect(
        getConnectChallengeTimeoutMsFromEnv({ OPENCLAW_GATEWAY_CONNECT_CHALLENGE_TIMEOUT_MS: '-5' }),
      ).toBe(DEFAULT_PREAUTH_HANDSHAKE_TIMEOUT_MS);
    });
  });

  describe('getPreauthHandshakeTimeoutMsFromEnv', () => {
    it('应与 getConnectChallengeTimeoutMsFromEnv 行为一致', () => {
      expect(getPreauthHandshakeTimeoutMsFromEnv({})).toBe(DEFAULT_PREAUTH_HANDSHAKE_TIMEOUT_MS);
      expect(
        getPreauthHandshakeTimeoutMsFromEnv({ OPENCLAW_GATEWAY_CONNECT_CHALLENGE_TIMEOUT_MS: '5000' }),
      ).toBe(5_000);
    });
  });

  describe('resolveConnectChallengeTimeoutMs / resolvePreauthHandshakeTimeoutMs', () => {
    it('undefined 入参应回退到默认值', () => {
      expect(resolveConnectChallengeTimeoutMs(undefined)).toBe(DEFAULT_PREAUTH_HANDSHAKE_TIMEOUT_MS);
    });

    it('数字入参应被夹取', () => {
      expect(resolveConnectChallengeTimeoutMs(5_000)).toBe(5_000);
      expect(resolveConnectChallengeTimeoutMs(0)).toBe(MIN_CONNECT_CHALLENGE_TIMEOUT_MS);
    });

    it('resolvePreauthHandshakeTimeoutMs 应等同 resolveConnectChallengeTimeoutMs', () => {
      expect(resolvePreauthHandshakeTimeoutMs(undefined)).toBe(DEFAULT_PREAUTH_HANDSHAKE_TIMEOUT_MS);
      expect(resolvePreauthHandshakeTimeoutMs(2_000)).toBe(2_000);
    });
  });

  describe('isSilentReplyText', () => {
    it('应识别默认令牌（大小写不敏感）', () => {
      expect(isSilentReplyText('no_reply')).toBe(true);
      expect(isSilentReplyText('NO_REPLY')).toBe(true);
      expect(isSilentReplyText('No_Reply')).toBe(true);
    });

    it('应忽略首尾空白', () => {
      expect(isSilentReplyText('  NO_REPLY  ')).toBe(true);
    });

    it('应识别自定义令牌', () => {
      expect(isSilentReplyText('silent', 'SILENT')).toBe(true);
    });

    it('不匹配的文本应返回 false', () => {
      expect(isSilentReplyText('hello')).toBe(false);
    });

    it('非字符串入参应返回 false', () => {
      expect(isSilentReplyText(123 as unknown as string)).toBe(false);
      expect(isSilentReplyText(null as unknown as string)).toBe(false);
    });

    it('SILENT_REPLY_TOKEN 常量应为 NO_REPLY', () => {
      expect(SILENT_REPLY_TOKEN).toBe('NO_REPLY');
    });
  });

  describe('trimToUndefined', () => {
    it('应去除首尾空白', () => {
      expect(trimToUndefined('  hello  ')).toBe('hello');
    });

    it('空字符串应返回 undefined', () => {
      expect(trimToUndefined('')).toBeUndefined();
    });

    it('纯空白应返回 undefined', () => {
      expect(trimToUndefined('   ')).toBeUndefined();
    });

    it('null 应返回 undefined', () => {
      expect(trimToUndefined(null)).toBeUndefined();
    });

    it('undefined 应返回 undefined', () => {
      expect(trimToUndefined(undefined)).toBeUndefined();
    });
  });

  describe('describeFailoverError', () => {
    it('Error 对象应提取 message 与 name', () => {
      const result = describeFailoverError(new Error('boom'));
      expect(result.message).toBe('boom');
      expect(result.reason).toBeUndefined();
    });

    it('401 状态应分类为 auth', () => {
      const err = Object.assign(new Error('unauthorized'), { status: 401 });
      const result = describeFailoverError(err);
      expect(result.status).toBe(401);
      expect(result.reason).toBe('auth');
    });

    it('429 状态应分类为 rate_limit', () => {
      const err = Object.assign(new Error('too many requests'), { status: 429 });
      const result = describeFailoverError(err);
      expect(result.reason).toBe('rate_limit');
    });

    it('503 状态应分类为 overloaded', () => {
      const err = Object.assign(new Error('service unavailable'), { status: 503 });
      const result = describeFailoverError(err);
      expect(result.reason).toBe('overloaded');
    });

    it('402 状态应分类为 billing', () => {
      const err = Object.assign(new Error('payment required'), { status: 402 });
      const result = describeFailoverError(err);
      expect(result.reason).toBe('billing');
    });

    it('字符串入参应直接作为 message', () => {
      const result = describeFailoverError('request timed out');
      expect(result.message).toBe('request timed out');
      expect(result.reason).toBe('timeout');
    });

    it('对象入参应提取 message/status/code', () => {
      const result = describeFailoverError({ message: 'invalid key', status: 401, code: 'AUTH_ERR' });
      expect(result.message).toBe('invalid key');
      expect(result.status).toBe(401);
      expect(result.code).toBe('AUTH_ERR');
      expect(result.reason).toBe('auth');
    });

    it('空入参应回退到 "request failed"', () => {
      const result = describeFailoverError(undefined);
      expect(result.message).toBe('request failed');
    });

    it('消息含 "model not found" 应分类为 model_not_found', () => {
      const result = describeFailoverError('model not found: gpt-x');
      expect(result.reason).toBe('model_not_found');
    });

    it('消息含 "format invalid" 应分类为 format', () => {
      const result = describeFailoverError('format invalid payload');
      expect(result.reason).toBe('format');
    });
  });

  describe('resolveFailoverStatus', () => {
    it('auth 应映射到 401', () => {
      expect(resolveFailoverStatus('auth')).toBe(401);
    });

    it('auth_permanent 应映射到 401', () => {
      expect(resolveFailoverStatus('auth_permanent')).toBe(401);
    });

    it('billing 应映射到 402', () => {
      expect(resolveFailoverStatus('billing')).toBe(402);
    });

    it('rate_limit 应映射到 429', () => {
      expect(resolveFailoverStatus('rate_limit')).toBe(429);
    });

    it('model_not_found 应映射到 400', () => {
      expect(resolveFailoverStatus('model_not_found')).toBe(400);
    });

    it('format 应映射到 400', () => {
      expect(resolveFailoverStatus('format')).toBe(400);
    });

    it('session_expired 应映射到 400', () => {
      expect(resolveFailoverStatus('session_expired')).toBe(400);
    });

    it('server_error 应映射到 502', () => {
      expect(resolveFailoverStatus('server_error')).toBe(502);
    });

    it('overloaded 应映射到 502', () => {
      expect(resolveFailoverStatus('overloaded')).toBe(502);
    });

    it('timeout 应映射到 504', () => {
      expect(resolveFailoverStatus('timeout')).toBe(504);
    });
  });

  describe('isLoopbackHost', () => {
    it('应识别 localhost', () => {
      expect(isLoopbackHost('localhost')).toBe(true);
    });

    it('应识别 127.0.0.1 与 ::1', () => {
      expect(isLoopbackHost('127.0.0.1')).toBe(true);
      expect(isLoopbackHost('::1')).toBe(true);
      expect(isLoopbackHost('[::1]')).toBe(true);
    });

    it('应识别 0.0.0.0', () => {
      expect(isLoopbackHost('0.0.0.0')).toBe(true);
    });

    it('应大小写不敏感并去除空白', () => {
      expect(isLoopbackHost('  Localhost  ')).toBe(true);
    });

    it('非 loopback 应返回 false', () => {
      expect(isLoopbackHost('example.com')).toBe(false);
    });

    it('非字符串应返回 false', () => {
      expect(isLoopbackHost(undefined)).toBe(false);
      expect(isLoopbackHost(123 as unknown as string)).toBe(false);
    });
  });

  describe('resolveHostName', () => {
    it('应去除端口', () => {
      expect(resolveHostName('example.com:8080')).toBe('example.com');
    });

    it('应小写化', () => {
      expect(resolveHostName('Example.COM')).toBe('example.com');
    });

    it('应处理 IPv6 方括号形式', () => {
      expect(resolveHostName('[::1]:3000')).toBe('::1');
      expect(resolveHostName('[fe80::1]')).toBe('fe80::1');
    });

    it('应保留多冒号 IPv6（不截断端口）', () => {
      expect(resolveHostName('::1')).toBe('::1');
    });

    it('undefined 应返回 undefined', () => {
      expect(resolveHostName(undefined)).toBeUndefined();
    });

    it('空字符串应返回 undefined', () => {
      expect(resolveHostName('')).toBeUndefined();
    });
  });

  describe('isValidIPv4', () => {
    it('应识别合法 IPv4', () => {
      expect(isValidIPv4('192.168.1.1')).toBe(true);
      expect(isValidIPv4('0.0.0.0')).toBe(true);
      expect(isValidIPv4('255.255.255.255')).toBe(true);
    });

    it('应拒绝段数不等于 4 的字符串', () => {
      expect(isValidIPv4('1.2.3')).toBe(false);
      expect(isValidIPv4('1.2.3.4.5')).toBe(false);
    });

    it('应拒绝超出 0-255 的段', () => {
      expect(isValidIPv4('256.1.1.1')).toBe(false);
    });

    it('应拒绝非数字段', () => {
      expect(isValidIPv4('a.b.c.d')).toBe(false);
    });

    it('应拒绝前导零', () => {
      expect(isValidIPv4('01.02.03.04')).toBe(false);
    });

    it('undefined 应返回 false', () => {
      expect(isValidIPv4(undefined)).toBe(false);
    });
  });

  describe('isPrivateOrLoopbackIpAddress', () => {
    it('应识别 loopback', () => {
      expect(isPrivateOrLoopbackIpAddress('127.0.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIpAddress('localhost')).toBe(true);
    });

    it('应识别 10.x 私有段', () => {
      expect(isPrivateOrLoopbackIpAddress('10.0.0.1')).toBe(true);
    });

    it('应识别 172.16-31.x 私有段', () => {
      expect(isPrivateOrLoopbackIpAddress('172.16.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIpAddress('172.31.255.255')).toBe(true);
      expect(isPrivateOrLoopbackIpAddress('172.32.0.1')).toBe(false);
    });

    it('应识别 192.168.x 私有段', () => {
      expect(isPrivateOrLoopbackIpAddress('192.168.0.1')).toBe(true);
    });

    it('应识别 100.64-127.x CGNAT 段', () => {
      expect(isPrivateOrLoopbackIpAddress('100.64.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIpAddress('100.127.255.255')).toBe(true);
      expect(isPrivateOrLoopbackIpAddress('100.63.0.1')).toBe(false);
      expect(isPrivateOrLoopbackIpAddress('100.128.0.1')).toBe(false);
    });

    it('应拒绝公网地址', () => {
      expect(isPrivateOrLoopbackIpAddress('8.8.8.8')).toBe(false);
    });

    it('非字符串应返回 false', () => {
      expect(isPrivateOrLoopbackIpAddress(undefined)).toBe(false);
    });
  });

  describe('isIpv6Address', () => {
    it('含冒号的字符串应返回 true', () => {
      expect(isIpv6Address('::1')).toBe(true);
      expect(isIpv6Address('fe80::1')).toBe(true);
    });

    it('纯 IPv4 应返回 false', () => {
      expect(isIpv6Address('192.168.1.1')).toBe(false);
    });

    it('非字符串应返回 false', () => {
      expect(isIpv6Address(undefined)).toBe(false);
    });
  });

  describe('parseCanonicalIpAddress', () => {
    it('应去除首尾空白并返回', () => {
      expect(parseCanonicalIpAddress('  192.168.1.1  ')).toBe('192.168.1.1');
    });

    it('空字符串应返回 null', () => {
      expect(parseCanonicalIpAddress('')).toBe(null);
    });

    it('纯空白应返回 null', () => {
      expect(parseCanonicalIpAddress('   ')).toBe(null);
    });

    it('非字符串应返回 null', () => {
      expect(parseCanonicalIpAddress(undefined)).toBe(null);
    });
  });

  describe('getPluginRegistryState', () => {
    it('降级实现应始终返回 undefined', () => {
      expect(getPluginRegistryState()).toBeUndefined();
    });
  });

  describe('resolveReservedGatewayMethodScope', () => {
    it('降级实现应始终返回 undefined', () => {
      expect(resolveReservedGatewayMethodScope('any.method')).toBeUndefined();
    });
  });
});
