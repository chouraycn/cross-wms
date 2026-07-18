import type { MailProviderId } from './mail-providers.js';
import type { MailWatcherErrorType } from './types.js';

const ADDRESS_IN_USE_RE = /address already in use|EADDRINUSE/i;
const AUTH_FAILED_RE =
  /authentication failed|invalid credentials|AUTHENTICATIONFAILED|LOGIN failed|password incorrect|账号或密码错误|授权码错误/i;
const CONNECTION_REFUSED_RE = /connection refused|ECONNREFUSED|无法连接|连接被拒绝/i;
const TIMEOUT_RE = /timeout|ETIMEDOUT|timed out|超时/i;
const RATE_LIMIT_RE = /rate limit|too many|429|限流|频率限制/i;

export function isAddressInUseError(message: string): boolean {
  return ADDRESS_IN_USE_RE.test(message);
}

export function isAuthenticationError(message: string): boolean {
  return AUTH_FAILED_RE.test(message);
}

export function isConnectionError(message: string): boolean {
  return CONNECTION_REFUSED_RE.test(message);
}

export function isTimeoutError(message: string): boolean {
  return TIMEOUT_RE.test(message);
}

export function isRateLimitError(message: string): boolean {
  return RATE_LIMIT_RE.test(message);
}

export function classifyMailWatcherError(message: string): MailWatcherErrorType {
  if (isAddressInUseError(message)) return 'address-in-use';
  if (isAuthenticationError(message)) return 'authentication';
  if (isTimeoutError(message)) return 'timeout';
  if (isRateLimitError(message)) return 'rate-limit';
  if (isConnectionError(message)) return 'connection';
  return 'unknown';
}

export function getErrorUserMessage(
  errorType: MailWatcherErrorType,
  provider?: MailProviderId,
): string {
  switch (errorType) {
    case 'authentication':
      if (provider === '163' || provider === 'qq') {
        return '认证失败，请检查邮箱账号和授权码是否正确。注意：需要使用授权码而非登录密码。';
      }
      if (provider === 'dingtalk' || provider === 'wecom') {
        return '认证失败，请检查企业邮箱账号和密码是否正确。';
      }
      return '认证失败，请检查邮箱账号和密码是否正确。';
    case 'connection':
      return '无法连接到邮件服务器，请检查网络连接和服务器地址配置。';
    case 'timeout':
      return '连接邮件服务器超时，请检查网络连接或稍后重试。';
    case 'rate-limit':
      return '请求过于频繁，已触发限流，请稍后再试。';
    case 'address-in-use':
      return '端口已被占用，请检查是否有其他程序正在使用。';
    case 'unknown':
    default:
      return '邮件服务发生未知错误，请检查配置。';
  }
}

export function getProviderSpecificTroubleshooting(provider: MailProviderId): string[] {
  switch (provider) {
    case '163':
      return [
        '确保已在 163 邮箱设置中开启 IMAP/SMTP 服务',
        '使用授权码（app password）而非登录密码',
        '检查账号是否被锁定或需要安全验证',
        '确认 IMAP 服务器地址：imap.163.com:993',
      ];
    case 'qq':
      return [
        '确保已在 QQ 邮箱设置中开启 IMAP/SMTP 服务',
        '使用授权码而非登录密码',
        '检查账号是否有安全限制',
        '确认 IMAP 服务器地址：imap.qq.com:993',
      ];
    case 'aliyun':
      return [
        '确保已开启 IMAP/SMTP 服务',
        '使用企业邮箱账号密码登录',
        '确认 IMAP 服务器地址：imap.mxhichina.com:993',
      ];
    case 'dingtalk':
      return [
        '确保钉钉邮箱已开通 IMAP 服务',
        '使用钉钉邮箱完整账号和密码',
        '确认 IMAP 服务器地址：imap.dingtalk.com:993',
      ];
    case 'wecom':
      return [
        '确保企业微信邮箱已开启 IMAP 服务',
        '使用企业微信邮箱账号和专用密码',
        '确认 IMAP 服务器地址：imap.exmail.qq.com:993',
      ];
    case 'outlook':
      return [
        '建议使用 OAuth2 认证方式',
        '检查账号是否启用双重验证',
        '确认 IMAP 服务器地址：outlook.office365.com:993',
      ];
    case 'custom':
    default:
      return [
        '检查 IMAP/SMTP 服务器地址和端口',
        '确认 SSL/TLS 设置是否正确',
        '检查网络连接是否正常',
      ];
  }
}
