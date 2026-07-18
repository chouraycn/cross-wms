export type MailProviderId =
  | '163'
  | 'qq'
  | 'aliyun'
  | 'outlook'
  | 'dingtalk'
  | 'wecom'
  | 'custom';

export interface MailProviderConfig {
  id: MailProviderId;
  name: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  pop3Host?: string;
  pop3Port?: number;
  pop3Secure?: boolean;
  supportsOAuth2: boolean;
  authType?: 'password' | 'oauth2' | 'app-password';
  webmailUrl?: string;
  helpUrl?: string;
}

export const MAIL_PROVIDERS: Record<MailProviderId, MailProviderConfig> = {
  '163': {
    id: '163',
    name: '网易163邮箱',
    smtpHost: 'smtp.163.com',
    smtpPort: 465,
    smtpSecure: true,
    imapHost: 'imap.163.com',
    imapPort: 993,
    imapSecure: true,
    pop3Host: 'pop.163.com',
    pop3Port: 995,
    pop3Secure: true,
    supportsOAuth2: false,
    authType: 'app-password',
    webmailUrl: 'https://mail.163.com',
    helpUrl: 'https://mail.163.com/help',
  },
  qq: {
    id: 'qq',
    name: 'QQ邮箱',
    smtpHost: 'smtp.qq.com',
    smtpPort: 465,
    smtpSecure: true,
    imapHost: 'imap.qq.com',
    imapPort: 993,
    imapSecure: true,
    pop3Host: 'pop.qq.com',
    pop3Port: 995,
    pop3Secure: true,
    supportsOAuth2: false,
    authType: 'app-password',
    webmailUrl: 'https://mail.qq.com',
    helpUrl: 'https://service.mail.qq.com',
  },
  aliyun: {
    id: 'aliyun',
    name: '阿里云企业邮箱',
    smtpHost: 'smtp.mxhichina.com',
    smtpPort: 465,
    smtpSecure: true,
    imapHost: 'imap.mxhichina.com',
    imapPort: 993,
    imapSecure: true,
    pop3Host: 'pop.mxhichina.com',
    pop3Port: 995,
    pop3Secure: true,
    supportsOAuth2: false,
    authType: 'password',
    webmailUrl: 'https://mail.aliyun.com',
    helpUrl: 'https://help.aliyun.com/product/35476.html',
  },
  outlook: {
    id: 'outlook',
    name: 'Outlook邮箱',
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    pop3Host: 'outlook.office365.com',
    pop3Port: 995,
    pop3Secure: true,
    supportsOAuth2: true,
    authType: 'oauth2',
    webmailUrl: 'https://outlook.office.com',
  },
  dingtalk: {
    id: 'dingtalk',
    name: '钉钉邮箱',
    smtpHost: 'smtp.dingtalk.com',
    smtpPort: 465,
    smtpSecure: true,
    imapHost: 'imap.dingtalk.com',
    imapPort: 993,
    imapSecure: true,
    pop3Host: 'pop3.dingtalk.com',
    pop3Port: 995,
    pop3Secure: true,
    supportsOAuth2: false,
    authType: 'password',
    webmailUrl: 'https://mail.dingtalk.com',
    helpUrl: 'https://developers.dingtalk.com/document/app/mail',
  },
  wecom: {
    id: 'wecom',
    name: '企业微信邮箱',
    smtpHost: 'smtp.exmail.qq.com',
    smtpPort: 465,
    smtpSecure: true,
    imapHost: 'imap.exmail.qq.com',
    imapPort: 993,
    imapSecure: true,
    pop3Host: 'pop.exmail.qq.com',
    pop3Port: 995,
    pop3Secure: true,
    supportsOAuth2: false,
    authType: 'password',
    webmailUrl: 'https://mail.weixin.qq.com',
    helpUrl: 'https://work.weixin.qq.com/help',
  },
  custom: {
    id: 'custom',
    name: '自定义邮件服务',
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    imapHost: '',
    imapPort: 143,
    imapSecure: false,
    supportsOAuth2: false,
    authType: 'password',
  },
};

export function getMailProvider(providerId: MailProviderId): MailProviderConfig {
  return MAIL_PROVIDERS[providerId] ?? MAIL_PROVIDERS.custom;
}

export function getMailProviderByEmail(email: string): MailProviderId {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return 'custom';

  if (domain.endsWith('163.com') || domain.endsWith('126.com') || domain.endsWith('yeah.net')) {
    return '163';
  }
  if (domain.endsWith('exmail.qq.com') || domain.endsWith('weixin.qq.com')) {
    return 'wecom';
  }
  if (domain.endsWith('qq.com') || domain.endsWith('foxmail.com')) return 'qq';
  if (domain.endsWith('aliyun.com') || domain.endsWith('mxhichina.com')) return 'aliyun';
  if (
    domain.endsWith('outlook.com') ||
    domain.endsWith('hotmail.com') ||
    domain.endsWith('live.com') ||
    domain.endsWith('office365.com')
  ) {
    return 'outlook';
  }
  if (domain.endsWith('dingtalk.com') || domain.endsWith('aliyun-inc.com')) {
    return 'dingtalk';
  }
  return 'custom';
}

export function getProviderAuthInstructions(providerId: MailProviderId): string {
  const provider = getMailProvider(providerId);
  switch (provider.authType) {
    case 'app-password':
      return `请在 ${provider.name} 设置中开启 IMAP/SMTP 服务并生成授权码（app password），使用授权码作为密码登录。`;
    case 'oauth2':
      return `请使用 OAuth2 授权方式登录 ${provider.name}。`;
    case 'password':
    default:
      return `请使用您的 ${provider.name} 账号密码登录，确保已开启 IMAP/SMTP 服务。`;
  }
}

export function isChineseProvider(providerId: MailProviderId): boolean {
  return ['163', 'qq', 'aliyun', 'dingtalk', 'wecom'].includes(providerId);
}
