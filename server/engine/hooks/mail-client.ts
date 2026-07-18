import net from 'node:net';
import tls from 'node:tls';
import { type MailHookRuntimeConfig, type MailOAuth2Config } from './mail.js';

export interface MailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
  encoding: string;
}

export interface MailMessage {
  id: string;
  uid: number;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  htmlBody: string;
  attachments: MailAttachment[];
  receivedAt: Date;
  flags: string[];
  size: number;
}

export interface MailSearchFilter {
  from?: string;
  to?: string;
  subject?: string;
  keyword?: string;
  since?: Date;
  before?: Date;
  flag?: string;
  unseen?: boolean;
}

export class MailClient {
  private config: MailHookRuntimeConfig;
  private smtpSocket: tls.TLSSocket | net.Socket | null = null;
  private imapSocket: tls.TLSSocket | net.Socket | null = null;
  private imapTag = 0;

  constructor(config: MailHookRuntimeConfig) {
    this.config = config;
  }

  async connectSMTP(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { host, port, secure } = this.config.smtp;

      const connect = () => {
        if (secure) {
          this.smtpSocket = tls.connect({ host, port, rejectUnauthorized: false }, onConnect);
        } else {
          this.smtpSocket = net.createConnection({ host, port }, onConnect);
        }

        this.smtpSocket.on('error', reject);
        this.smtpSocket.on('close', () => {
          this.smtpSocket = null;
        });
      };

      const onConnect = async () => {
        try {
          await this.readSMTPResponse();
          await this.sendSMTPCommand(`EHLO ${host}`);
          await this.authenticateSMTP();
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      connect();
    });
  }

  async disconnectSMTP(): Promise<void> {
    if (this.smtpSocket) {
      try {
        await this.sendSMTPCommand('QUIT');
      } catch {
        // ignore
      }
      this.smtpSocket.destroy();
      this.smtpSocket = null;
    }
  }

  async sendEmail(options: {
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    htmlBody?: string;
    attachments?: MailAttachment[];
  }): Promise<void> {
    if (!this.smtpSocket) {
      await this.connectSMTP();
    }

    const recipients = [...options.to, ...(options.cc || []), ...(options.bcc || [])];

    await this.sendSMTPCommand(`MAIL FROM:<${options.from}>`);

    for (const to of recipients) {
      await this.sendSMTPCommand(`RCPT TO:<${to}>`);
    }

    await this.sendSMTPCommand('DATA');

    const headers: string[] = [];
    headers.push(`From: ${options.from}`);
    headers.push(`To: ${options.to.join(', ')}`);
    if (options.cc?.length) {
      headers.push(`Cc: ${options.cc.join(', ')}`);
    }
    headers.push(`Subject: ${options.subject}`);
    headers.push(`Date: ${new Date().toISOString()}`);

    const hasAttachments = options.attachments !== undefined && options.attachments.length > 0;
    const hasHtml = !!options.htmlBody;

    if (hasAttachments) {
      const boundary = `----=_NextPart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
      headers.push('MIME-Version: 1.0');

      const bodyParts: string[] = [];

      if (hasHtml) {
        bodyParts.push(`--${boundary}`);
        bodyParts.push('Content-Type: multipart/alternative; boundary="alt_boundary"');
        bodyParts.push('');
        bodyParts.push('--alt_boundary');
        bodyParts.push('Content-Type: text/plain; charset=utf-8');
        bodyParts.push('');
        bodyParts.push(options.body);
        bodyParts.push('');
        bodyParts.push('--alt_boundary');
        bodyParts.push('Content-Type: text/html; charset=utf-8');
        bodyParts.push('');
        bodyParts.push(options.htmlBody || '');
        bodyParts.push('');
        bodyParts.push('--alt_boundary--');
      } else {
        bodyParts.push(`--${boundary}`);
        bodyParts.push('Content-Type: text/plain; charset=utf-8');
        bodyParts.push('');
        bodyParts.push(options.body);
        bodyParts.push('');
      }

      for (const attachment of options.attachments!) {
        bodyParts.push(`--${boundary}`);
        bodyParts.push(`Content-Type: ${attachment.contentType}`);
        bodyParts.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
        bodyParts.push(`Content-Transfer-Encoding: ${attachment.encoding}`);
        bodyParts.push('');
        bodyParts.push(attachment.content.toString(attachment.encoding === 'base64' ? 'base64' : 'ascii'));
        bodyParts.push('');
      }

      bodyParts.push(`--${boundary}--`);

      const message = [...headers, '', ...bodyParts, '.'].join('\r\n');
      await this.writeSMTPData(message);
    } else if (hasHtml) {
      const boundary = `----=_NextPart_${Date.now()}`;
      headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      headers.push('MIME-Version: 1.0');

      const bodyParts = [
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        options.body,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        options.htmlBody,
        '',
        `--${boundary}--`,
      ];

      const message = [...headers, '', ...bodyParts, '.'].join('\r\n');
      await this.writeSMTPData(message);
    } else {
      headers.push('Content-Type: text/plain; charset=utf-8');
      const message = [...headers, '', options.body, '.'].join('\r\n');
      await this.writeSMTPData(message);
    }
  }

  async connectIMAP(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { host, port, secure } = this.config.imap;

      const connect = () => {
        if (secure) {
          this.imapSocket = tls.connect({ host, port, rejectUnauthorized: false }, onConnect);
        } else {
          this.imapSocket = net.createConnection({ host, port }, onConnect);
        }

        this.imapSocket.on('error', reject);
        this.imapSocket.on('close', () => {
          this.imapSocket = null;
        });
      };

      const onConnect = async () => {
        try {
          await this.readIMAPResponse();
          await this.authenticateIMAP();
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      connect();
    });
  }

  async disconnectIMAP(): Promise<void> {
    if (this.imapSocket) {
      try {
        await this.sendIMAPCommand('LOGOUT');
      } catch {
        // ignore
      }
      this.imapSocket.destroy();
      this.imapSocket = null;
    }
  }

  async selectMailbox(mailbox: string = 'INBOX'): Promise<void> {
    await this.sendIMAPCommand(`SELECT ${mailbox}`);
  }

  async searchMessages(filter: MailSearchFilter): Promise<number[]> {
    const criteria: string[] = [];

    if (filter.from) criteria.push(`FROM "${filter.from}"`);
    if (filter.to) criteria.push(`TO "${filter.to}"`);
    if (filter.subject) criteria.push(`SUBJECT "${filter.subject}"`);
    if (filter.keyword) criteria.push(`KEYWORD "${filter.keyword}"`);
    if (filter.since) criteria.push(`SINCE "${formatIMAPDate(filter.since)}"`);
    if (filter.before) criteria.push(`BEFORE "${formatIMAPDate(filter.before)}"`);
    if (filter.flag) criteria.push(filter.flag.toUpperCase());
    if (filter.unseen) criteria.push('UNSEEN');

    const response = await this.sendIMAPCommand(`SEARCH ${criteria.join(' ')}`);
    const match = response.match(/SEARCH\s+(.+)/);
    if (match) {
      return match[1].split(' ').filter(Boolean).map(Number);
    }
    return [];
  }

  async fetchMessage(uid: number): Promise<MailMessage | null> {
    const response = await this.sendIMAPCommand(`FETCH ${uid} (UID ENVELOPE BODY[] FLAGS RFC822.SIZE)`);

    const uidMatch = response.match(/UID\s+(\d+)/);
    const flagsMatch = response.match(/FLAGS\s+\(([^)]*)\)/);
    const sizeMatch = response.match(/RFC822\.SIZE\s+(\d+)/);

    const envelopeMatch = response.match(/ENVELOPE\s+\((.*?)\)/s);
    if (!envelopeMatch) return null;

    const envelopeParts = parseIMAPEnvelope(envelopeMatch[1]);

    const bodyMatch = response.match(/BODY\[\]\s+(\{[\d+]+\})\r\n([\s\S]*?)\r\n/m);
    let bodyContent = '';
    let htmlContent = '';
    const attachments: MailAttachment[] = [];

    if (bodyMatch) {
      bodyContent = bodyMatch[2];
      const parsed = parseEmailBody(bodyContent);
      bodyContent = parsed.text;
      htmlContent = parsed.html;
      attachments.push(...parsed.attachments);
    }

    const dateStr = envelopeParts.date || '';
    const receivedAt = dateStr ? new Date(dateStr) : new Date();

    return {
      id: String(uid),
      uid: uidMatch ? parseInt(uidMatch[1], 10) : uid,
      from: envelopeParts.from || '',
      to: envelopeParts.to || [],
      cc: envelopeParts.cc || [],
      bcc: envelopeParts.bcc || [],
      subject: envelopeParts.subject || '',
      body: bodyContent,
      htmlBody: htmlContent,
      attachments,
      receivedAt,
      flags: flagsMatch ? flagsMatch[1].split(' ').filter(Boolean) : [],
      size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
    };
  }

  async fetchRecentMessages(count: number = 10): Promise<MailMessage[]> {
    await this.selectMailbox(this.config.label);
    const response = await this.sendIMAPCommand('SEARCH RECENT');
    const match = response.match(/SEARCH\s+(.+)/);
    if (!match) return [];

    const uids = match[1].split(' ').filter(Boolean).map(Number).slice(-count);
    const messages: MailMessage[] = [];

    for (const uid of uids) {
      const msg = await this.fetchMessage(uid);
      if (msg) messages.push(msg);
    }

    return messages;
  }

  async markAsRead(uid: number): Promise<void> {
    await this.sendIMAPCommand(`STORE ${uid} +FLAGS \\Seen`);
  }

  async markAsUnread(uid: number): Promise<void> {
    await this.sendIMAPCommand(`STORE ${uid} -FLAGS \\Seen`);
  }

  async markAsFlagged(uid: number): Promise<void> {
    await this.sendIMAPCommand(`STORE ${uid} +FLAGS \\Flagged`);
  }

  async deleteMessage(uid: number): Promise<void> {
    await this.sendIMAPCommand(`STORE ${uid} +FLAGS \\Deleted`);
    await this.sendIMAPCommand('EXPUNGE');
  }

  async getUnreadCount(mailbox: string = 'INBOX'): Promise<number> {
    await this.selectMailbox(mailbox);
    const response = await this.sendIMAPCommand('STATUS INBOX (UNSEEN)');
    const match = response.match(/UNSEEN\s+(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  private async authenticateSMTP(): Promise<void> {
    const { auth, account } = this.config;

    if (auth.type === 'oauth2' && auth.oauth2) {
      const accessToken = await this.getOAuth2AccessToken(auth.oauth2);
      const authString = Buffer.from(`user=${account}\x01auth=Bearer ${accessToken}\x01\x01`).toString('base64');
      await this.sendSMTPCommand(`AUTH XOAUTH2 ${authString}`);
    } else if (auth.type === 'password' && auth.pass) {
      await this.sendSMTPCommand('AUTH LOGIN');
      await this.sendSMTPCommand(Buffer.from(account).toString('base64'));
      await this.sendSMTPCommand(Buffer.from(auth.pass).toString('base64'));
    }
  }

  private async authenticateIMAP(): Promise<void> {
    const { auth, account } = this.config;

    if (auth.type === 'oauth2' && auth.oauth2) {
      const accessToken = await this.getOAuth2AccessToken(auth.oauth2);
      const authString = Buffer.from(`user=${account}\x01auth=Bearer ${accessToken}\x01\x01`).toString('base64');
      await this.sendIMAPCommand(`AUTHENTICATE XOAUTH2 ${authString}`);
    } else if (auth.type === 'password' && auth.pass) {
      await this.sendIMAPCommand(`LOGIN "${account}" "${auth.pass}"`);
    }
  }

  private async getOAuth2AccessToken(oauth2: MailOAuth2Config): Promise<string> {
    if (oauth2.accessToken && (!oauth2.accessTokenExpiresAt || Date.now() < oauth2.accessTokenExpiresAt)) {
      return oauth2.accessToken!;
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: oauth2.clientId,
        client_secret: oauth2.clientSecret,
        refresh_token: oauth2.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const data = await response.json();
    if (!data.access_token) {
      throw new Error('Failed to refresh OAuth2 access token');
    }

    oauth2.accessToken = data.access_token;
    if (data.expires_in) {
      oauth2.accessTokenExpiresAt = Date.now() + data.expires_in * 1000;
    }

    return oauth2.accessToken!;
  }

  private async readSMTPResponse(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.smtpSocket) {
        reject(new Error('SMTP socket not connected'));
        return;
      }

      let buffer = '';
      const onData = (data: Buffer) => {
        buffer += data.toString();
        if (buffer.includes('\r\n')) {
          this.smtpSocket?.off('data', onData);
          const lines = buffer.split('\r\n').filter(Boolean);
          const lastLine = lines[lines.length - 1];

          if (lastLine.startsWith('2')) {
            resolve(buffer);
          } else if (lastLine.startsWith('354')) {
            resolve(buffer);
          } else {
            reject(new Error(`SMTP error: ${buffer}`));
          }
        }
      };

      this.smtpSocket.on('data', onData);
    });
  }

  private async sendSMTPCommand(command: string): Promise<string> {
    if (!this.smtpSocket) {
      throw new Error('SMTP socket not connected');
    }
    return new Promise((resolve, reject) => {
      this.smtpSocket?.write(`${command}\r\n`, (err) => {
        if (err) {
          reject(err);
        } else {
          this.readSMTPResponse().then(resolve).catch(reject);
        }
      });
    });
  }

  private async writeSMTPData(data: string): Promise<string> {
    if (!this.smtpSocket) {
      throw new Error('SMTP socket not connected');
    }
    return new Promise((resolve, reject) => {
      this.smtpSocket?.write(`${data}\r\n`, (err) => {
        if (err) {
          reject(err);
        } else {
          this.readSMTPResponse().then(resolve).catch(reject);
        }
      });
    });
  }

  private async readIMAPResponse(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.imapSocket) {
        reject(new Error('IMAP socket not connected'));
        return;
      }

      let buffer = '';
      const onData = (data: Buffer) => {
        buffer += data.toString();
        if (buffer.includes('\r\n')) {
          const lines = buffer.split('\r\n').filter(Boolean);
          const lastLine = lines[lines.length - 1];

          if (lastLine.startsWith('* OK') || lastLine.startsWith('OK') || lastLine.startsWith('*')) {
            if (buffer.includes('BAD') || buffer.includes('NO')) {
              this.imapSocket?.off('data', onData);
              reject(new Error(`IMAP error: ${buffer}`));
            }
          }

          const tagMatch = buffer.match(/^(\d+)\s+(OK|NO|BAD)/m);
          if (tagMatch) {
            this.imapSocket?.off('data', onData);
            if (tagMatch[2] === 'OK') {
              resolve(buffer);
            } else {
              reject(new Error(`IMAP error: ${buffer}`));
            }
          }
        }
      };

      this.imapSocket.on('data', onData);
    });
  }

  public async sendIMAPCommand(command: string): Promise<string> {
    if (!this.imapSocket) {
      throw new Error('IMAP socket not connected');
    }

    this.imapTag++;
    const tag = String(this.imapTag).padStart(4, '0');

    return new Promise((resolve, reject) => {
      this.imapSocket?.write(`${tag} ${command}\r\n`, (err) => {
        if (err) {
          reject(err);
        } else {
          this.readIMAPResponse().then(resolve).catch(reject);
        }
      });
    });
  }
}

function formatIMAPDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${day}-${getMonthName(date.getMonth())}-${year}`;
}

function getMonthName(month: number): string {
  const names = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return names[month];
}

function parseIMAPEnvelope(envelope: string): {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  date: string;
} {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < envelope.length; i++) {
    const char = envelope[i];
    if (char === '(') {
      depth++;
      if (depth > 1) current += char;
    } else if (char === ')') {
      depth--;
      if (depth > 0) current += char;
      else if (depth === 0 && current.trim()) {
        parts.push(current.trim());
        current = '';
      }
    } else if (char === ' ' && depth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.trim()) parts.push(current.trim());

  const parseAddress = (addr: string): string => {
    const match = addr.match(/\(([^)]+)\)/);
    return match ? match[1] : addr.replace(/"/g, '');
  };

  const parseAddresses = (addrs: string): string[] => {
    if (!addrs || addrs === 'NIL') return [];
    const inner = addrs.slice(1, -1);
    const addresses: string[] = [];
    let depth = 0;
    let current = '';

    for (let i = 0; i < inner.length; i++) {
      const char = inner[i];
      if (char === '(') {
        depth++;
        current += char;
      } else if (char === ')') {
        depth--;
        current += char;
        if (depth === 0) {
          addresses.push(parseAddress(current));
          current = '';
        }
      } else if (char === ' ' && depth === 0) {
        // skip
      } else {
        current += char;
      }
    }

    return addresses;
  };

  return {
    from: parseAddress(parts[0] || 'NIL'),
    to: parseAddresses(parts[1] || 'NIL'),
    cc: parseAddresses(parts[2] || 'NIL'),
    bcc: parseAddresses(parts[3] || 'NIL'),
    subject: parts[4]?.replace(/"/g, '') || '',
    date: parts[5]?.replace(/"/g, '') || '',
  };
}

function parseEmailBody(raw: string): { text: string; html: string; attachments: MailAttachment[] } {
  const lines = raw.split('\r\n');
  let inBody = false;
  let contentType = 'text/plain';
  let boundary = '';
  let currentPart = '';
  const parts: string[] = [];
  let inAttachment = false;

  for (const line of lines) {
    if (!inBody) {
      if (line === '') {
        inBody = true;
      } else {
        const ctMatch = line.match(/^Content-Type:\s*(.+)/i);
        if (ctMatch) {
          contentType = ctMatch[1];
          const boundaryMatch = contentType.match(/boundary="([^"]+)"/);
          if (boundaryMatch) {
            boundary = boundaryMatch[1];
          }
        }
      }
    } else if (boundary && line.startsWith(`--${boundary}`)) {
      if (currentPart.trim()) {
        parts.push(currentPart);
      }
      currentPart = '';
      inAttachment = line.includes('attachment');
    } else {
      currentPart += line + '\n';
    }
  }

  if (currentPart.trim()) {
    parts.push(currentPart);
  }

  const textParts: string[] = [];
  const htmlParts: string[] = [];
  const attachments: MailAttachment[] = [];

  for (const part of parts) {
    const ctMatch = part.match(/Content-Type:\s*(.+)/i);
    const cdMatch = part.match(/Content-Disposition:\s*(.+)/i);
    const ceMatch = part.match(/Content-Transfer-Encoding:\s*(.+)/i);
    const fnMatch = part.match(/filename="([^"]+)"/i);

    const isAttachment = cdMatch?.[1].includes('attachment') || false;
    const isText = ctMatch?.[1].includes('text/plain') || false;
    const isHtml = ctMatch?.[1].includes('text/html') || false;

    const bodyStart = part.indexOf('\n\n');
    const bodyContent = bodyStart !== -1 ? part.slice(bodyStart + 2).trim() : '';

    if (isAttachment && fnMatch) {
      attachments.push({
        filename: fnMatch[1],
        contentType: ctMatch?.[1] || 'application/octet-stream',
        content: Buffer.from(bodyContent, ceMatch?.[1] === 'base64' ? 'base64' : 'ascii'),
        encoding: ceMatch?.[1] || 'base64',
      });
    } else if (isText) {
      textParts.push(bodyContent);
    } else if (isHtml) {
      htmlParts.push(bodyContent);
    }
  }

  return {
    text: textParts.join('\n\n'),
    html: htmlParts.join('\n\n'),
    attachments,
  };
}