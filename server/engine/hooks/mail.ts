import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { getMailProvider, getMailProviderByEmail, type MailProviderId } from './mail-providers.js';

export const DEFAULT_MAIL_LABEL = 'INBOX';
export const DEFAULT_MAIL_MAX_BYTES = 20_000;
export const DEFAULT_MAIL_RENEW_MINUTES = 12 * 60;
export const DEFAULT_MAIL_CHECK_INTERVAL_MS = 30_000;

export type MailAuthType = 'password' | 'oauth2';

export interface MailOAuth2Config {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
}

export interface MailAccountConfig {
  email: string;
  provider?: MailProviderId;
  auth: {
    type: MailAuthType;
    pass?: string;
    oauth2?: MailOAuth2Config;
  };
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  label?: string;
}

export interface MailHookOverrides {
  account?: string;
  provider?: MailProviderId;
  label?: string;
  hookToken?: string;
  hookUrl?: string;
  includeBody?: boolean;
  maxBytes?: number;
  renewEveryMinutes?: number;
  checkIntervalMs?: number;
}

export interface MailHookRuntimeConfig {
  account: string;
  provider: MailProviderId;
  providerConfig: ReturnType<typeof getMailProvider>;
  auth: MailAccountConfig['auth'];
  smtp: {
    host: string;
    port: number;
    secure: boolean;
  };
  imap: {
    host: string;
    port: number;
    secure: boolean;
  };
  label: string;
  hookToken: string;
  hookUrl: string;
  includeBody: boolean;
  maxBytes: number;
  renewEveryMinutes: number;
  checkIntervalMs: number;
}

const MailOAuth2Schema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  refreshToken: z.string().min(1),
  accessToken: z.string().optional(),
  accessTokenExpiresAt: z.number().optional(),
});

const MailAuthSchema = z.object({
  type: z.enum(['password', 'oauth2']),
  pass: z.string().optional(),
  oauth2: MailOAuth2Schema.optional(),
}).refine((data) => {
  if (data.type === 'password') {
    return !!data.pass;
  }
  if (data.type === 'oauth2') {
    return !!data.oauth2;
  }
  return true;
}, {
  message: 'password auth requires pass, oauth2 auth requires oauth2 config',
});

const MailAccountSchema = z.object({
  email: z.string().email(),
  provider: z.enum(['163', 'qq', 'aliyun', 'outlook', 'custom']).optional(),
  auth: MailAuthSchema,
  smtpHost: z.string().optional(),
  smtpPort: z.number().positive().optional(),
  smtpSecure: z.boolean().optional(),
  imapHost: z.string().optional(),
  imapPort: z.number().positive().optional(),
  imapSecure: z.boolean().optional(),
  label: z.string().optional(),
});

export const MailAccountConfigSchema = MailAccountSchema;

export function generateHookToken(bytes = 24): string {
  return randomBytes(bytes).toString('hex');
}

type MailConfigLike = {
  hooks?: {
    enabled?: boolean;
    path?: string;
    token?: string;
    mail?: {
      account?: string;
      provider?: MailProviderId;
      label?: string;
      hookUrl?: string;
      includeBody?: boolean;
      maxBytes?: number;
      renewEveryMinutes?: number;
      checkIntervalMs?: number;
      auth?: MailAccountConfig['auth'];
      smtpHost?: string;
      smtpPort?: number;
      smtpSecure?: boolean;
      imapHost?: string;
      imapPort?: number;
      imapSecure?: boolean;
    };
  };
};

export function resolveMailHookRuntimeConfig(
  cfg: MailConfigLike,
  overrides: MailHookOverrides,
): { ok: true; value: MailHookRuntimeConfig } | { ok: false; error: string } {
  const hooks = cfg.hooks;
  const mail = hooks?.mail;

  const account = overrides.account ?? mail?.account ?? '';
  if (!account) {
    return { ok: false, error: 'mail account (email) required' };
  }

  const hookToken = overrides.hookToken ?? hooks?.token ?? '';
  if (!hookToken) {
    return { ok: false, error: 'hooks.token missing (needed for mail hook)' };
  }

  const providerId = overrides.provider ?? mail?.provider ?? getMailProviderByEmail(account);
  const providerConfig = getMailProvider(providerId);

  const auth = mail?.auth ?? { type: 'password' as const };
  if (auth.type === 'password' && !auth.pass) {
    return { ok: false, error: 'mail auth.pass required for password authentication' };
  }

  const smtpHost = overrides.provider === 'custom' && mail?.smtpHost ? mail.smtpHost : providerConfig.smtpHost;
  const smtpPort = overrides.provider === 'custom' && mail?.smtpPort !== undefined ? mail.smtpPort : providerConfig.smtpPort;
  const smtpSecure = overrides.provider === 'custom' && mail?.smtpSecure !== undefined ? mail.smtpSecure : providerConfig.smtpSecure;

  if (!smtpHost) {
    return { ok: false, error: 'smtp host required for custom provider' };
  }

  const imapHost = overrides.provider === 'custom' && mail?.imapHost ? mail.imapHost : providerConfig.imapHost;
  const imapPort = overrides.provider === 'custom' && mail?.imapPort !== undefined ? mail.imapPort : providerConfig.imapPort;
  const imapSecure = overrides.provider === 'custom' && mail?.imapSecure !== undefined ? mail.imapSecure : providerConfig.imapSecure;

  if (!imapHost) {
    return { ok: false, error: 'imap host required for custom provider' };
  }

  const label = overrides.label ?? mail?.label ?? DEFAULT_MAIL_LABEL;

  const hookUrl = overrides.hookUrl ?? mail?.hookUrl ?? buildDefaultHookUrl(hooks?.path);

  const includeBody = overrides.includeBody ?? mail?.includeBody ?? true;

  const maxBytesRaw = overrides.maxBytes ?? mail?.maxBytes;
  const maxBytes =
    typeof maxBytesRaw === 'number' && Number.isFinite(maxBytesRaw) && maxBytesRaw > 0
      ? Math.floor(maxBytesRaw)
      : DEFAULT_MAIL_MAX_BYTES;

  const renewEveryMinutesRaw = overrides.renewEveryMinutes ?? mail?.renewEveryMinutes;
  const renewEveryMinutes =
    typeof renewEveryMinutesRaw === 'number' &&
    Number.isFinite(renewEveryMinutesRaw) &&
    renewEveryMinutesRaw > 0
      ? Math.floor(renewEveryMinutesRaw)
      : DEFAULT_MAIL_RENEW_MINUTES;

  const checkIntervalMsRaw = overrides.checkIntervalMs ?? mail?.checkIntervalMs;
  const checkIntervalMs =
    typeof checkIntervalMsRaw === 'number' &&
    Number.isFinite(checkIntervalMsRaw) &&
    checkIntervalMsRaw > 0
      ? Math.floor(checkIntervalMsRaw)
      : DEFAULT_MAIL_CHECK_INTERVAL_MS;

  return {
    ok: true,
    value: {
      account,
      provider: providerId,
      providerConfig,
      auth,
      smtp: {
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
      },
      imap: {
        host: imapHost,
        port: imapPort,
        secure: imapSecure,
      },
      label,
      hookToken,
      hookUrl,
      includeBody,
      maxBytes,
      renewEveryMinutes,
      checkIntervalMs,
    },
  };
}

export function buildDefaultHookUrl(
  hooksPath?: string,
  port: number = 3000,
): string {
  const basePath = hooksPath?.trim() || '/hooks';
  const normalizedPath = basePath.startsWith('/') ? basePath : `/${basePath}`;
  const url = new URL(`http://127.0.0.1:${port}`);
  url.pathname = `${normalizedPath.replace(/\/+$/, '')}/mail`;
  return url.toString();
}