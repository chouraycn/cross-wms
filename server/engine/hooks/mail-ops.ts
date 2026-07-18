import { logger } from '../../logger.js';
import {
  DEFAULT_MAIL_LABEL,
  DEFAULT_MAIL_MAX_BYTES,
  DEFAULT_MAIL_RENEW_MINUTES,
  generateHookToken,
  type MailAccountConfig,
  type MailHookOverrides,
  type MailHookRuntimeConfig,
  resolveMailHookRuntimeConfig,
} from './mail.js';
import { MailClient, type MailAttachment, type MailMessage, type MailSearchFilter } from './mail-client.js';

export type MailSetupOptions = {
  email: string;
  provider?: string;
  password?: string;
  oauth2?: MailAccountConfig['auth']['oauth2'];
  label?: string;
  json?: boolean;
};

export type MailRunOptions = {
  account?: string;
  provider?: string;
  label?: string;
  hookToken?: string;
  hookUrl?: string;
  includeBody?: boolean;
  maxBytes?: number;
  renewEveryMinutes?: number;
  checkIntervalMs?: number;
};

export type MailSendOptions = {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  htmlBody?: string;
  attachments?: MailAttachment[];
};

export type MailSearchOptions = MailSearchFilter & {
  limit?: number;
};

export async function setupMailAccount(opts: MailSetupOptions): Promise<{
  ok: boolean;
  config?: MailAccountConfig;
  error?: string;
}> {
  try {
    const provider = opts.provider || inferProviderFromEmail(opts.email);

    const auth: MailAccountConfig['auth'] = opts.password
      ? { type: 'password', pass: opts.password }
      : opts.oauth2
        ? { type: 'oauth2', oauth2: opts.oauth2 }
        : { type: 'password' };

    const config: MailAccountConfig = {
      email: opts.email,
      provider: provider as MailAccountConfig['provider'],
      auth,
      label: opts.label || DEFAULT_MAIL_LABEL,
    };

    if (opts.json) {
      logger.info(JSON.stringify(config, null, 2));
    } else {
      logger.info(`Mail account configured:`);
      logger.info(`- email: ${opts.email}`);
      logger.info(`- provider: ${provider}`);
      logger.info(`- auth type: ${auth.type}`);
      logger.info(`- label: ${config.label}`);
    }

    return { ok: true, config };
  } catch (err) {
    const error = String(err);
    logger.error(`Mail setup failed: ${error}`);
    return { ok: false, error };
  }
}

export async function sendMail(
  config: MailHookRuntimeConfig,
  options: MailSendOptions,
): Promise<{ ok: boolean; error?: string }> {
  const client = new MailClient(config);

  try {
    await client.connectSMTP();
    await client.sendEmail(options);
    await client.disconnectSMTP();

    logger.info(`Mail sent successfully to ${options.to.join(', ')}`);
    return { ok: true };
  } catch (err) {
    const error = String(err);
    logger.error(`Failed to send mail: ${error}`);
    try {
      await client.disconnectSMTP();
    } catch {
      // ignore
    }
    return { ok: false, error };
  }
}

export async function fetchEmails(
  config: MailHookRuntimeConfig,
  options: MailSearchOptions = {},
): Promise<{ ok: boolean; messages?: MailMessage[]; error?: string }> {
  const client = new MailClient(config);

  try {
    await client.connectIMAP();
    await client.selectMailbox(config.label);

    let messages: MailMessage[] = [];

    if (Object.keys(options).length > 0 && options.limit === undefined) {
      const filter: MailSearchFilter = {
        from: options.from,
        to: options.to,
        subject: options.subject,
        keyword: options.keyword,
        since: options.since,
        before: options.before,
        flag: options.flag,
        unseen: options.unseen,
      };

      const uids = await client.searchMessages(filter);
      const limit = options.limit || uids.length;

      for (const uid of uids.slice(0, limit)) {
        const msg = await client.fetchMessage(uid);
        if (msg) messages.push(msg);
      }
    } else {
      messages = await client.fetchRecentMessages(options.limit || 10);
    }

    await client.disconnectIMAP();

    logger.info(`Fetched ${messages.length} messages`);
    return { ok: true, messages };
  } catch (err) {
    const error = String(err);
    logger.error(`Failed to fetch emails: ${error}`);
    try {
      await client.disconnectIMAP();
    } catch {
      // ignore
    }
    return { ok: false, error };
  }
}

export async function searchEmails(
  config: MailHookRuntimeConfig,
  filter: MailSearchFilter,
): Promise<{ ok: boolean; uids?: number[]; error?: string }> {
  const client = new MailClient(config);

  try {
    await client.connectIMAP();
    await client.selectMailbox(config.label);
    const uids = await client.searchMessages(filter);
    await client.disconnectIMAP();

    logger.info(`Found ${uids.length} messages matching filter`);
    return { ok: true, uids };
  } catch (err) {
    const error = String(err);
    logger.error(`Failed to search emails: ${error}`);
    try {
      await client.disconnectIMAP();
    } catch {
      // ignore
    }
    return { ok: false, error };
  }
}

export async function markEmailAsRead(
  config: MailHookRuntimeConfig,
  uid: number,
): Promise<{ ok: boolean; error?: string }> {
  const client = new MailClient(config);

  try {
    await client.connectIMAP();
    await client.selectMailbox(config.label);
    await client.markAsRead(uid);
    await client.disconnectIMAP();

    logger.info(`Email ${uid} marked as read`);
    return { ok: true };
  } catch (err) {
    const error = String(err);
    logger.error(`Failed to mark email as read: ${error}`);
    try {
      await client.disconnectIMAP();
    } catch {
      // ignore
    }
    return { ok: false, error };
  }
}

export async function markEmailAsUnread(
  config: MailHookRuntimeConfig,
  uid: number,
): Promise<{ ok: boolean; error?: string }> {
  const client = new MailClient(config);

  try {
    await client.connectIMAP();
    await client.selectMailbox(config.label);
    await client.markAsUnread(uid);
    await client.disconnectIMAP();

    logger.info(`Email ${uid} marked as unread`);
    return { ok: true };
  } catch (err) {
    const error = String(err);
    logger.error(`Failed to mark email as unread: ${error}`);
    try {
      await client.disconnectIMAP();
    } catch {
      // ignore
    }
    return { ok: false, error };
  }
}

export async function flagEmail(
  config: MailHookRuntimeConfig,
  uid: number,
): Promise<{ ok: boolean; error?: string }> {
  const client = new MailClient(config);

  try {
    await client.connectIMAP();
    await client.selectMailbox(config.label);
    await client.markAsFlagged(uid);
    await client.disconnectIMAP();

    logger.info(`Email ${uid} flagged`);
    return { ok: true };
  } catch (err) {
    const error = String(err);
    logger.error(`Failed to flag email: ${error}`);
    try {
      await client.disconnectIMAP();
    } catch {
      // ignore
    }
    return { ok: false, error };
  }
}

export async function deleteEmail(
  config: MailHookRuntimeConfig,
  uid: number,
): Promise<{ ok: boolean; error?: string }> {
  const client = new MailClient(config);

  try {
    await client.connectIMAP();
    await client.selectMailbox(config.label);
    await client.deleteMessage(uid);
    await client.disconnectIMAP();

    logger.info(`Email ${uid} deleted`);
    return { ok: true };
  } catch (err) {
    const error = String(err);
    logger.error(`Failed to delete email: ${error}`);
    try {
      await client.disconnectIMAP();
    } catch {
      // ignore
    }
    return { ok: false, error };
  }
}

export async function getUnreadCount(
  config: MailHookRuntimeConfig,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const client = new MailClient(config);

  try {
    await client.connectIMAP();
    const count = await client.getUnreadCount(config.label);
    await client.disconnectIMAP();

    return { ok: true, count };
  } catch (err) {
    const error = String(err);
    logger.error(`Failed to get unread count: ${error}`);
    try {
      await client.disconnectIMAP();
    } catch {
      // ignore
    }
    return { ok: false, error };
  }
}

export async function runMailService(opts: MailRunOptions): Promise<void> {
  const config: {
    hooks?: {
      enabled?: boolean;
      path?: string;
      token?: string;
      mail?: {
        account?: string;
        provider?: '163' | 'qq' | 'aliyun' | 'outlook' | 'custom';
        label?: string;
        hookUrl?: string;
        includeBody?: boolean;
        maxBytes?: number;
        renewEveryMinutes?: number;
        checkIntervalMs?: number;
      };
    };
  } = {};

  const overrides: MailHookOverrides = {
    account: opts.account,
    provider: opts.provider as MailHookOverrides['provider'],
    label: opts.label,
    hookToken: opts.hookToken,
    hookUrl: opts.hookUrl,
    includeBody: opts.includeBody,
    maxBytes: opts.maxBytes,
    renewEveryMinutes: opts.renewEveryMinutes,
    checkIntervalMs: opts.checkIntervalMs,
  };

  const resolved = resolveMailHookRuntimeConfig(config, overrides);
  if (!resolved.ok) {
    throw new Error(resolved.error);
  }

  const runtimeConfig = resolved.value;

  logger.info(`Starting mail service for ${runtimeConfig.account}`);

  let shuttingDown = false;

  const renewMs = runtimeConfig.renewEveryMinutes * 60_000;
  const renewTimer = setInterval(async () => {
    if (shuttingDown) return;
    logger.debug(`Renewing mail watch for ${runtimeConfig.account}`);
  }, renewMs);

  const detachSignals = () => {
    process.off('SIGINT', shutdown);
    process.off('SIGTERM', shutdown);
  };

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    detachSignals();
    clearInterval(renewTimer);
    logger.info('Mail service shutting down');
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info(`Mail service running (check interval: ${runtimeConfig.checkIntervalMs}ms)`);
}

function inferProviderFromEmail(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return 'custom';

  if (domain.endsWith('163.com')) return '163';
  if (domain.endsWith('qq.com')) return 'qq';
  if (domain.endsWith('aliyun.com') || domain.endsWith('mxhichina.com')) return 'aliyun';
  if (domain.endsWith('outlook.com') || domain.endsWith('hotmail.com') || domain.endsWith('live.com')) {
    return 'outlook';
  }
  return 'custom';
}