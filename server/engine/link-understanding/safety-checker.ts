/**
 * Link Safety Checker — 链接安全检查
 *
 * 检测恶意链接、钓鱼链接、SSRF 风险等。
 * 结合 cross-wms SSRF 模块与启发式规则。
 */

import { isIpHost, parseLinkInfo } from './extractor.js';
import type { LinkRisk, LinkRiskLevel, LinkSafetyResult } from './types.js';

/** 可疑 TLD 列表（常被滥用） */
const SUSPICIOUS_TLDS = [
  '.zip',
  '.mov',
  '.xyz',
  '.top',
  '.click',
  '.tk',
  '.ml',
  '.ga',
  '.cf',
  '.gq',
  '.country',
  '.kim',
  '.science',
  '.work',
  '.party',
];

/** 钓鱼/可疑关键词 */
const PHISHING_KEYWORDS = [
  'login',
  'signin',
  'verify',
  'account',
  'password',
  'bank',
  'paypal',
  'apple-id',
  'icloud',
  'secure',
  'confirm',
  'update',
  'wallet',
  'crypto',
  'free',
  'bonus',
  'prize',
  'winner',
  'login-secure',
  'account-verify',
  '登录',
  '验证',
  '密码',
  '账号',
  '安全',
  '免费',
  '中奖',
];

/** 品牌仿冒检测关键词（域名中包含知名品牌但非官方域名） */
const BRAND_IMPERSONATION = [
  'apple',
  'google',
  'microsoft',
  'amazon',
  'paypal',
  'facebook',
  'instagram',
  'twitter',
  'github',
  'alibaba',
  'taobao',
  'tencent',
  'wechat',
  'baidu',
];

export interface SafetyCheckerOptions {
  /** 自定义可疑 TLD 列表（覆盖默认） */
  suspiciousTlds?: string[];
  /** 自定义钓鱼关键词（覆盖默认） */
  phishingKeywords?: string[];
  /** 允许的私有网络（白名单域名） */
  privateNetworkAllowlist?: string[];
}

export interface LinkSafetyChecker {
  check(url: string): LinkSafetyResult;
}

export function createLinkSafetyChecker(
  opts: SafetyCheckerOptions = {},
): LinkSafetyChecker {
  const suspiciousTlds = opts.suspiciousTlds ?? SUSPICIOUS_TLDS;
  const phishingKeywords = opts.phishingKeywords ?? PHISHING_KEYWORDS;
  const privateAllowlist = opts.privateNetworkAllowlist ?? [];

  function check(url: string): LinkSafetyResult {
    const info = parseLinkInfo(url);
    if (!info) {
      return {
        safe: false,
        riskLevel: 'high',
        risks: ['non-http'],
        reasons: ['URL 格式无效'],
      };
    }

    const risks: LinkRisk[] = [];
    const reasons: string[] = [];

    // 非 HTTP(S) 协议
    if (info.protocol !== 'http' && info.protocol !== 'https') {
      risks.push('non-http');
      reasons.push(`非 HTTP(S) 协议: ${info.protocol}`);
    }

    // 内网地址 / SSRF
    if (info.isPrivate && !privateAllowlist.includes(info.hostname)) {
      risks.push('ssrf', 'private-network');
      reasons.push(`内网地址: ${info.hostname}`);
    }

    // IP 主机（常用于钓鱼）
    if (isIpHost(info.hostname) && !info.isPrivate) {
      risks.push('ip-host');
      reasons.push(`使用 IP 主机: ${info.hostname}`);
    }

    // 可疑 TLD
    const lowerHost = info.hostname.toLowerCase();
    for (const tld of suspiciousTlds) {
      if (lowerHost.endsWith(tld)) {
        risks.push('suspicious-tld');
        reasons.push(`可疑 TLD: ${tld}`);
        break;
      }
    }

    // 过多子域名（钓鱼常用）
    const subdomainCount = info.hostname.split('.').length - 2;
    if (subdomainCount > 4) {
      risks.push('excessive-subdomains');
      reasons.push(`子域名层级过多: ${subdomainCount + 2}`);
    }

    // URL 中包含凭据（user:pass@host）
    if (url.includes('://') && url.split('://')[1]?.includes('@')) {
      risks.push('credentials-in-url');
      reasons.push('URL 中包含凭据信息');
    }

    // 钓鱼关键词（在主机名或路径中）
    const urlLower = url.toLowerCase();
    const matchedKeywords = phishingKeywords.filter((kw) => urlLower.includes(kw));
    if (matchedKeywords.length > 0) {
      risks.push('phishing');
      reasons.push(`检测到可疑关键词: ${matchedKeywords.join(', ')}`);
    }

    // 品牌仿冒检测：域名包含知名品牌但非官方域名
    for (const brand of BRAND_IMPERSONATION) {
      if (lowerHost.includes(brand)) {
        const officialDomains = getOfficialDomains(brand);
        const isOfficial = officialDomains.some((d) => lowerHost === d || lowerHost.endsWith('.' + d));
        if (!isOfficial) {
          risks.push('phishing');
          reasons.push(`疑似仿冒品牌: ${brand}`);
          break;
        }
      }
    }

    const riskLevel = computeRiskLevel(risks);
    return {
      safe: riskLevel === 'safe' || riskLevel === 'low',
      riskLevel,
      risks: dedupeRisks(risks),
      reasons,
    };
  }

  return { check };
}

/** 根据风险列表计算风险等级 */
export function computeRiskLevel(risks: LinkRisk[]): LinkRiskLevel {
  if (risks.length === 0) return 'safe';
  if (risks.includes('ssrf') || risks.includes('malware')) return 'critical';
  if (risks.includes('phishing') || risks.includes('credentials-in-url')) return 'high';
  if (risks.includes('private-network') || risks.includes('ip-host')) return 'medium';
  if (risks.includes('suspicious-tld') || risks.includes('excessive-subdomains')) return 'low';
  if (risks.includes('suspicious-keywords') || risks.includes('non-http')) return 'low';
  return 'low';
}

/** 去重风险列表 */
function dedupeRisks(risks: LinkRisk[]): LinkRisk[] {
  return Array.from(new Set(risks));
}

/** 知名品牌的官方域名映射 */
function getOfficialDomains(brand: string): string[] {
  const map: Record<string, string[]> = {
    apple: ['apple.com', 'icloud.com'],
    google: ['google.com', 'googleapis.com'],
    microsoft: ['microsoft.com', 'live.com', 'outlook.com'],
    amazon: ['amazon.com', 'aws.amazon.com'],
    paypal: ['paypal.com'],
    facebook: ['facebook.com', 'fb.com'],
    instagram: ['instagram.com'],
    twitter: ['twitter.com', 'x.com'],
    github: ['github.com'],
    alibaba: ['alibaba.com', '1688.com'],
    taobao: ['taobao.com', 'tmall.com'],
    tencent: ['tencent.com', 'qq.com'],
    wechat: ['wechat.com', 'weixin.qq.com'],
    baidu: ['baidu.com'],
  };
  return map[brand] ?? [];
}

/** 默认安全检查器实例 */
export const defaultSafetyChecker = createLinkSafetyChecker();
