import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../logger.js';
import {
  getMailProvider,
  getMailProviderByEmail,
  getProviderAuthInstructions,
  isChineseProvider,
  type MailProviderId,
} from './mail-providers.js';
import { getProviderSpecificTroubleshooting } from './gmail-watcher-errors.js';

export type MailSetupValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  provider: MailProviderId;
  authInstructions: string;
  troubleshooting: string[];
};

export function validateMailAccountConfig(config: {
  email: string;
  password: string;
  provider?: MailProviderId;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
}): MailSetupValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const email = config.email?.trim() || '';
  const password = config.password || '';

  if (!email) {
    errors.push('邮箱地址不能为空');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('邮箱地址格式不正确');
  }

  if (!password) {
    errors.push('密码或授权码不能为空');
  }

  const detectedProvider = config.provider || getMailProviderByEmail(email);
  const providerConfig = getMailProvider(detectedProvider);

  if (detectedProvider === 'custom') {
    if (!config.imapHost) {
      errors.push('自定义邮件服务需要配置 IMAP 服务器地址');
    }
    if (!config.smtpHost) {
      errors.push('自定义邮件服务需要配置 SMTP 服务器地址');
    }
  }

  if (isChineseProvider(detectedProvider)) {
    if (password.length < 8) {
      warnings.push('密码/授权码长度较短，建议确认是否正确');
    }
    if (detectedProvider === '163' || detectedProvider === 'qq') {
      warnings.push('国内邮箱通常需要使用授权码而非登录密码');
    }
  }

  const authInstructions = getProviderAuthInstructions(detectedProvider);
  const troubleshooting = getProviderSpecificTroubleshooting(detectedProvider);

  logger.debug(
    `[hooks:SetupUtils] Validated mail config for ${detectedProvider}: valid=${errors.length === 0}`,
  );

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    provider: detectedProvider,
    authInstructions,
    troubleshooting,
  };
}

export function buildIMAPConfig(config: {
  email: string;
  password: string;
  provider?: MailProviderId;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
}): {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
} {
  const provider = config.provider || getMailProviderByEmail(config.email);
  const providerConfig = getMailProvider(provider);

  return {
    host: config.imapHost || providerConfig.imapHost,
    port: config.imapPort || providerConfig.imapPort,
    secure: config.imapSecure !== undefined ? config.imapSecure : providerConfig.imapSecure,
    user: config.email,
    password: config.password,
  };
}

export function buildSMTPConfig(config: {
  email: string;
  password: string;
  provider?: MailProviderId;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
}): {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
} {
  const provider = config.provider || getMailProviderByEmail(config.email);
  const providerConfig = getMailProvider(provider);

  return {
    host: config.smtpHost || providerConfig.smtpHost,
    port: config.smtpPort || providerConfig.smtpPort,
    secure: config.smtpSecure !== undefined ? config.smtpSecure : providerConfig.smtpSecure,
    user: config.email,
    password: config.password,
  };
}

export function generateMailHookToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function validateMailHookToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  return /^[A-Za-z0-9]{32,}$/.test(token);
}

export async function ensureMailConfigDir(configDir: string): Promise<string> {
  const mailConfigDir = path.join(configDir, 'mail');
  await fs.promises.mkdir(mailConfigDir, { recursive: true });
  return mailConfigDir;
}

export function getMailConfigPath(configDir: string, accountId: string): string {
  return path.join(configDir, 'mail', `${accountId}.json`);
}

export async function saveMailAccountConfig(
  configDir: string,
  accountId: string,
  config: Record<string, unknown>,
): Promise<void> {
  const dir = await ensureMailConfigDir(configDir);
  const configPath = path.join(dir, `${accountId}.json`);
  const data = JSON.stringify(config, null, 2);
  await fs.promises.writeFile(configPath, data, 'utf8');
  logger.info(`[hooks:SetupUtils] Saved mail config for ${accountId}`);
}

export async function loadMailAccountConfig(
  configDir: string,
  accountId: string,
): Promise<Record<string, unknown> | null> {
  const configPath = getMailConfigPath(configDir, accountId);
  try {
    const data = await fs.promises.readFile(configPath, 'utf8');
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function listMailAccounts(configDir: string): Promise<string[]> {
  const mailConfigDir = path.join(configDir, 'mail');
  try {
    const files = await fs.promises.readdir(mailConfigDir);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5))
      .sort();
  } catch {
    return [];
  }
}

export async function deleteMailAccountConfig(
  configDir: string,
  accountId: string,
): Promise<boolean> {
  const configPath = getMailConfigPath(configDir, accountId);
  try {
    await fs.promises.unlink(configPath);
    logger.info(`[hooks:SetupUtils] Deleted mail config for ${accountId}`);
    return true;
  } catch {
    return false;
  }
}

export function detectMailProviderFromEmail(email: string): MailProviderId {
  return getMailProviderByEmail(email);
}

export function getMailSetupChecklist(provider: MailProviderId): {
  title: string;
  items: Array<{ label: string; checked: boolean }>;
} {
  const providerConfig = getMailProvider(provider);
  const items: Array<{ label: string; checked: boolean }> = [
    { label: `已开通 ${providerConfig.name} 邮箱账号`, checked: false },
    { label: '已开启 IMAP/SMTP 服务', checked: false },
    { label: '已获取密码或授权码', checked: false },
    { label: '确认服务器地址和端口正确', checked: false },
  ];

  if (providerConfig.authType === 'app-password') {
    items[2].label = '已生成并保存授权码（app password）';
  }

  return {
    title: `${providerConfig.name} 配置检查清单`,
    items,
  };
}
