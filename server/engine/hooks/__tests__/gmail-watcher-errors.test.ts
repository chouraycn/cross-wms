import { describe, it, expect } from 'vitest';
import {
  isAddressInUseError,
  isAuthenticationError,
  isConnectionError,
  isTimeoutError,
  isRateLimitError,
  classifyMailWatcherError,
  getErrorUserMessage,
  getProviderSpecificTroubleshooting,
} from '../gmail-watcher-errors.js';

describe('gmail-watcher-errors', () => {
  describe('isAddressInUseError', () => {
    it('should detect address in use errors', () => {
      expect(isAddressInUseError('EADDRINUSE: address already in use')).toBe(true);
      expect(isAddressInUseError('Address already in use')).toBe(true);
      expect(isAddressInUseError('some other error')).toBe(false);
    });
  });

  describe('isAuthenticationError', () => {
    it('should detect authentication errors', () => {
      expect(isAuthenticationError('authentication failed')).toBe(true);
      expect(isAuthenticationError('invalid credentials')).toBe(true);
      expect(isAuthenticationError('AUTHENTICATIONFAILED')).toBe(true);
      expect(isAuthenticationError('账号或密码错误')).toBe(true);
      expect(isAuthenticationError('授权码错误')).toBe(true);
      expect(isAuthenticationError('LOGIN failed')).toBe(true);
    });

    it('should return false for non-auth errors', () => {
      expect(isAuthenticationError('connection timeout')).toBe(false);
    });
  });

  describe('isConnectionError', () => {
    it('should detect connection errors', () => {
      expect(isConnectionError('connection refused')).toBe(true);
      expect(isConnectionError('ECONNREFUSED')).toBe(true);
      expect(isConnectionError('无法连接')).toBe(true);
      expect(isConnectionError('连接被拒绝')).toBe(true);
    });
  });

  describe('isTimeoutError', () => {
    it('should detect timeout errors', () => {
      expect(isTimeoutError('connection timeout')).toBe(true);
      expect(isTimeoutError('ETIMEDOUT')).toBe(true);
      expect(isTimeoutError('timed out')).toBe(true);
      expect(isTimeoutError('超时')).toBe(true);
    });
  });

  describe('isRateLimitError', () => {
    it('should detect rate limit errors', () => {
      expect(isRateLimitError('rate limit exceeded')).toBe(true);
      expect(isRateLimitError('too many connections')).toBe(true);
      expect(isRateLimitError('429 Too Many Requests')).toBe(true);
      expect(isRateLimitError('限流')).toBe(true);
      expect(isRateLimitError('频率限制')).toBe(true);
    });
  });

  describe('classifyMailWatcherError', () => {
    it('should classify address-in-use errors', () => {
      expect(classifyMailWatcherError('EADDRINUSE')).toBe('address-in-use');
    });

    it('should classify authentication errors', () => {
      expect(classifyMailWatcherError('authentication failed')).toBe('authentication');
    });

    it('should classify timeout errors', () => {
      expect(classifyMailWatcherError('connection timed out')).toBe('timeout');
    });

    it('should classify rate limit errors', () => {
      expect(classifyMailWatcherError('rate limit')).toBe('rate-limit');
    });

    it('should classify connection errors', () => {
      expect(classifyMailWatcherError('connection refused')).toBe('connection');
    });

    it('should classify unknown errors', () => {
      expect(classifyMailWatcherError('some random error')).toBe('unknown');
    });
  });

  describe('getErrorUserMessage', () => {
    it('should return user-friendly auth message for 163', () => {
      const msg = getErrorUserMessage('authentication', '163');
      expect(msg).toContain('授权码');
    });

    it('should return user-friendly auth message for QQ', () => {
      const msg = getErrorUserMessage('authentication', 'qq');
      expect(msg).toContain('授权码');
    });

    it('should return user-friendly auth message for DingTalk', () => {
      const msg = getErrorUserMessage('authentication', 'dingtalk');
      expect(msg).toContain('企业邮箱');
    });

    it('should return connection error message', () => {
      const msg = getErrorUserMessage('connection');
      expect(msg).toContain('无法连接');
    });

    it('should return timeout error message', () => {
      const msg = getErrorUserMessage('timeout');
      expect(msg).toContain('超时');
    });

    it('should return rate limit error message', () => {
      const msg = getErrorUserMessage('rate-limit');
      expect(msg).toContain('限流');
    });

    it('should return address-in-use error message', () => {
      const msg = getErrorUserMessage('address-in-use');
      expect(msg).toContain('端口');
    });

    it('should return unknown error message', () => {
      const msg = getErrorUserMessage('unknown');
      expect(msg).toContain('未知错误');
    });
  });

  describe('getProviderSpecificTroubleshooting', () => {
    it('should return troubleshooting for 163', () => {
      const tips = getProviderSpecificTroubleshooting('163');
      expect(tips.length).toBeGreaterThan(0);
      expect(tips[0]).toContain('IMAP');
    });

    it('should return troubleshooting for QQ', () => {
      const tips = getProviderSpecificTroubleshooting('qq');
      expect(tips.length).toBeGreaterThan(0);
    });

    it('should return troubleshooting for aliyun', () => {
      const tips = getProviderSpecificTroubleshooting('aliyun');
      expect(tips.length).toBeGreaterThan(0);
    });

    it('should return troubleshooting for DingTalk', () => {
      const tips = getProviderSpecificTroubleshooting('dingtalk');
      expect(tips.length).toBeGreaterThan(0);
      expect(tips[0]).toContain('钉钉');
    });

    it('should return troubleshooting for WeCom', () => {
      const tips = getProviderSpecificTroubleshooting('wecom');
      expect(tips.length).toBeGreaterThan(0);
      expect(tips[0]).toContain('企业微信');
    });

    it('should return troubleshooting for Outlook', () => {
      const tips = getProviderSpecificTroubleshooting('outlook');
      expect(tips.length).toBeGreaterThan(0);
    });

    it('should return troubleshooting for custom', () => {
      const tips = getProviderSpecificTroubleshooting('custom');
      expect(tips.length).toBeGreaterThan(0);
    });
  });
});
