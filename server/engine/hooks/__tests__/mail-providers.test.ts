import { describe, it, expect } from 'vitest';
import {
  MAIL_PROVIDERS,
  getMailProvider,
  getMailProviderByEmail,
  getProviderAuthInstructions,
  isChineseProvider,
} from '../mail-providers.js';

describe('mail-providers', () => {
  describe('MAIL_PROVIDERS', () => {
    it('should contain all Chinese email providers', () => {
      expect(MAIL_PROVIDERS['163']).toBeDefined();
      expect(MAIL_PROVIDERS['qq']).toBeDefined();
      expect(MAIL_PROVIDERS['aliyun']).toBeDefined();
      expect(MAIL_PROVIDERS['dingtalk']).toBeDefined();
      expect(MAIL_PROVIDERS['wecom']).toBeDefined();
    });

    it('should have correct IMAP/SMTP settings for 163', () => {
      const provider = MAIL_PROVIDERS['163'];
      expect(provider.imapHost).toBe('imap.163.com');
      expect(provider.imapPort).toBe(993);
      expect(provider.imapSecure).toBe(true);
      expect(provider.smtpHost).toBe('smtp.163.com');
      expect(provider.smtpPort).toBe(465);
      expect(provider.smtpSecure).toBe(true);
    });

    it('should have correct IMAP/SMTP settings for QQ', () => {
      const provider = MAIL_PROVIDERS['qq'];
      expect(provider.imapHost).toBe('imap.qq.com');
      expect(provider.imapPort).toBe(993);
      expect(provider.smtpHost).toBe('smtp.qq.com');
      expect(provider.smtpPort).toBe(465);
    });

    it('should have correct settings for DingTalk', () => {
      const provider = MAIL_PROVIDERS['dingtalk'];
      expect(provider.imapHost).toBe('imap.dingtalk.com');
      expect(provider.imapPort).toBe(993);
      expect(provider.smtpHost).toBe('smtp.dingtalk.com');
      expect(provider.smtpPort).toBe(465);
    });

    it('should have correct settings for WeCom', () => {
      const provider = MAIL_PROVIDERS['wecom'];
      expect(provider.imapHost).toBe('imap.exmail.qq.com');
      expect(provider.imapPort).toBe(993);
      expect(provider.smtpHost).toBe('smtp.exmail.qq.com');
      expect(provider.smtpPort).toBe(465);
    });
  });

  describe('getMailProvider', () => {
    it('should return provider config for valid id', () => {
      const provider = getMailProvider('163');
      expect(provider.id).toBe('163');
      expect(provider.name).toBe('网易163邮箱');
    });

    it('should return custom provider for unknown id', () => {
      const provider = getMailProvider('nonexistent' as never);
      expect(provider.id).toBe('custom');
    });
  });

  describe('getMailProviderByEmail', () => {
    it('should detect 163 email', () => {
      expect(getMailProviderByEmail('user@163.com')).toBe('163');
      expect(getMailProviderByEmail('user@126.com')).toBe('163');
      expect(getMailProviderByEmail('user@yeah.net')).toBe('163');
    });

    it('should detect QQ email', () => {
      expect(getMailProviderByEmail('user@qq.com')).toBe('qq');
      expect(getMailProviderByEmail('user@foxmail.com')).toBe('qq');
    });

    it('should detect aliyun email', () => {
      expect(getMailProviderByEmail('user@aliyun.com')).toBe('aliyun');
      expect(getMailProviderByEmail('user@mxhichina.com')).toBe('aliyun');
    });

    it('should detect DingTalk email', () => {
      expect(getMailProviderByEmail('user@dingtalk.com')).toBe('dingtalk');
    });

    it('should detect WeCom email', () => {
      expect(getMailProviderByEmail('user@exmail.qq.com')).toBe('wecom');
    });

    it('should detect Outlook email', () => {
      expect(getMailProviderByEmail('user@outlook.com')).toBe('outlook');
      expect(getMailProviderByEmail('user@hotmail.com')).toBe('outlook');
    });

    it('should return custom for unknown domains', () => {
      expect(getMailProviderByEmail('user@example.com')).toBe('custom');
    });

    it('should return custom for invalid email', () => {
      expect(getMailProviderByEmail('invalid-email')).toBe('custom');
    });
  });

  describe('getProviderAuthInstructions', () => {
    it('should mention app-password for 163', () => {
      const instructions = getProviderAuthInstructions('163');
      expect(instructions).toContain('授权码');
    });

    it('should mention app-password for QQ', () => {
      const instructions = getProviderAuthInstructions('qq');
      expect(instructions).toContain('授权码');
    });

    it('should mention OAuth2 for Outlook', () => {
      const instructions = getProviderAuthInstructions('outlook');
      expect(instructions).toContain('OAuth2');
    });
  });

  describe('isChineseProvider', () => {
    it('should return true for Chinese providers', () => {
      expect(isChineseProvider('163')).toBe(true);
      expect(isChineseProvider('qq')).toBe(true);
      expect(isChineseProvider('aliyun')).toBe(true);
      expect(isChineseProvider('dingtalk')).toBe(true);
      expect(isChineseProvider('wecom')).toBe(true);
    });

    it('should return false for non-Chinese providers', () => {
      expect(isChineseProvider('outlook')).toBe(false);
      expect(isChineseProvider('custom')).toBe(false);
    });
  });
});
