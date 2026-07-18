import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  validateMailAccountConfig,
  buildIMAPConfig,
  buildSMTPConfig,
  generateMailHookToken,
  validateMailHookToken,
  ensureMailConfigDir,
  saveMailAccountConfig,
  loadMailAccountConfig,
  listMailAccounts,
  deleteMailAccountConfig,
  detectMailProviderFromEmail,
  getMailSetupChecklist,
} from '../gmail-setup-utils.js';

describe('gmail-setup-utils', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mail-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('validateMailAccountConfig', () => {
    it('should validate valid config', () => {
      const result = validateMailAccountConfig({
        email: 'test@163.com',
        password: 'authcode123',
      });
      expect(result.valid).toBe(true);
      expect(result.provider).toBe('163');
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing email', () => {
      const result = validateMailAccountConfig({
        email: '',
        password: 'test',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('邮箱地址不能为空');
    });

    it('should detect invalid email format', () => {
      const result = validateMailAccountConfig({
        email: 'invalid-email',
        password: 'test',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('邮箱地址格式不正确');
    });

    it('should detect missing password', () => {
      const result = validateMailAccountConfig({
        email: 'test@example.com',
        password: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('密码或授权码不能为空');
    });

    it('should warn about short password for Chinese providers', () => {
      const result = validateMailAccountConfig({
        email: 'test@163.com',
        password: '123',
      });
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should warn about app-password for 163 and QQ', () => {
      const result163 = validateMailAccountConfig({
        email: 'test@163.com',
        password: 'longenoughpassword',
      });
      expect(result163.warnings.some((w) => w.includes('授权码'))).toBe(true);

      const resultQQ = validateMailAccountConfig({
        email: 'test@qq.com',
        password: 'longenoughpassword',
      });
      expect(resultQQ.warnings.some((w) => w.includes('授权码'))).toBe(true);
    });

    it('should include auth instructions', () => {
      const result = validateMailAccountConfig({
        email: 'test@163.com',
        password: 'test1234',
      });
      expect(result.authInstructions).toBeDefined();
      expect(result.authInstructions.length).toBeGreaterThan(0);
    });

    it('should include troubleshooting tips', () => {
      const result = validateMailAccountConfig({
        email: 'test@qq.com',
        password: 'test1234',
      });
      expect(result.troubleshooting.length).toBeGreaterThan(0);
    });
  });

  describe('buildIMAPConfig', () => {
    it('should build IMAP config with provider defaults', () => {
      const config = buildIMAPConfig({
        email: 'test@163.com',
        password: 'test',
      });
      expect(config.host).toBe('imap.163.com');
      expect(config.port).toBe(993);
      expect(config.secure).toBe(true);
      expect(config.user).toBe('test@163.com');
    });

    it('should use custom IMAP settings when provided', () => {
      const config = buildIMAPConfig({
        email: 'test@custom.com',
        password: 'test',
        provider: 'custom',
        imapHost: 'imap.custom.com',
        imapPort: 143,
        imapSecure: false,
      });
      expect(config.host).toBe('imap.custom.com');
      expect(config.port).toBe(143);
      expect(config.secure).toBe(false);
    });
  });

  describe('buildSMTPConfig', () => {
    it('should build SMTP config with provider defaults', () => {
      const config = buildSMTPConfig({
        email: 'test@qq.com',
        password: 'test',
      });
      expect(config.host).toBe('smtp.qq.com');
      expect(config.port).toBe(465);
      expect(config.secure).toBe(true);
    });

    it('should use custom SMTP settings when provided', () => {
      const config = buildSMTPConfig({
        email: 'test@custom.com',
        password: 'test',
        provider: 'custom',
        smtpHost: 'smtp.custom.com',
        smtpPort: 587,
        smtpSecure: false,
      });
      expect(config.host).toBe('smtp.custom.com');
      expect(config.port).toBe(587);
      expect(config.secure).toBe(false);
    });
  });

  describe('generateMailHookToken', () => {
    it('should generate token with correct length', () => {
      const token = generateMailHookToken();
      expect(token.length).toBe(32);
    });

    it('should generate alphanumeric token', () => {
      const token = generateMailHookToken();
      expect(/^[A-Za-z0-9]+$/.test(token)).toBe(true);
    });

    it('should generate unique tokens', () => {
      const token1 = generateMailHookToken();
      const token2 = generateMailHookToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('validateMailHookToken', () => {
    it('should validate valid tokens', () => {
      const token = generateMailHookToken();
      expect(validateMailHookToken(token)).toBe(true);
    });

    it('should reject empty token', () => {
      expect(validateMailHookToken('')).toBe(false);
    });

    it('should reject null/undefined token', () => {
      expect(validateMailHookToken(null as never)).toBe(false);
      expect(validateMailHookToken(undefined as never)).toBe(false);
    });

    it('should reject token with special characters', () => {
      expect(validateMailHookToken('abc!@#$')).toBe(false);
    });
  });

  describe('mail config persistence', () => {
    it('should save and load mail account config', async () => {
      const config = { email: 'test@163.com', password: 'test123' };
      await saveMailAccountConfig(tempDir, 'test-account', config);

      const loaded = await loadMailAccountConfig(tempDir, 'test-account');
      expect(loaded).toEqual(config);
    });

    it('should return null for non-existent account', async () => {
      const loaded = await loadMailAccountConfig(tempDir, 'nonexistent');
      expect(loaded).toBeNull();
    });

    it('should list mail accounts', async () => {
      await saveMailAccountConfig(tempDir, 'account1', { email: 'a@b.com' });
      await saveMailAccountConfig(tempDir, 'account2', { email: 'c@d.com' });

      const accounts = await listMailAccounts(tempDir);
      expect(accounts).toEqual(['account1', 'account2']);
    });

    it('should return empty list for no accounts', async () => {
      const accounts = await listMailAccounts(tempDir);
      expect(accounts).toEqual([]);
    });

    it('should delete mail account config', async () => {
      await saveMailAccountConfig(tempDir, 'to-delete', { email: 'a@b.com' });
      const deleted = await deleteMailAccountConfig(tempDir, 'to-delete');
      expect(deleted).toBe(true);

      const loaded = await loadMailAccountConfig(tempDir, 'to-delete');
      expect(loaded).toBeNull();
    });

    it('should return false when deleting non-existent account', async () => {
      const deleted = await deleteMailAccountConfig(tempDir, 'nonexistent');
      expect(deleted).toBe(false);
    });

    it('should ensure mail config dir exists', async () => {
      const dir = await ensureMailConfigDir(tempDir);
      expect(dir).toBe(path.join(tempDir, 'mail'));
      const exists = fs.existsSync(dir);
      expect(exists).toBe(true);
    });
  });

  describe('detectMailProviderFromEmail', () => {
    it('should detect provider from email', () => {
      expect(detectMailProviderFromEmail('user@163.com')).toBe('163');
      expect(detectMailProviderFromEmail('user@qq.com')).toBe('qq');
    });
  });

  describe('getMailSetupChecklist', () => {
    it('should return checklist for 163', () => {
      const checklist = getMailSetupChecklist('163');
      expect(checklist.title).toContain('网易163邮箱');
      expect(checklist.items.length).toBe(4);
      expect(checklist.items[2].label).toContain('授权码');
    });

    it('should return checklist with app-password label for QQ', () => {
      const checklist = getMailSetupChecklist('qq');
      expect(checklist.items[2].label).toContain('授权码');
    });

    it('should return checklist for custom provider', () => {
      const checklist = getMailSetupChecklist('custom');
      expect(checklist.items.length).toBe(4);
      expect(checklist.items[2].label).toContain('密码');
    });
  });
});
