/**
 * Link Safety Checker 单元测试
 */

import { describe, it, expect } from 'vitest';
import { createLinkSafetyChecker, computeRiskLevel } from '../safety-checker.js';
import type { LinkRisk } from '../types.js';

describe('LinkSafetyChecker', () => {
  const checker = createLinkSafetyChecker();

  it('安全公网 URL 应返回 safe', () => {
    const result = checker.check('https://example.com/article');
    expect(result.safe).toBe(true);
    expect(result.riskLevel).toBe('safe');
    expect(result.risks).toHaveLength(0);
  });

  it('内网 IP 应标记 SSRF 风险', () => {
    const result = checker.check('http://10.0.0.1/internal');
    expect(result.safe).toBe(false);
    expect(result.riskLevel).toBe('critical');
    expect(result.risks).toContain('ssrf');
    expect(result.risks).toContain('private-network');
  });

  it('localhost 应标记 SSRF 风险', () => {
    const result = checker.check('http://localhost/admin');
    expect(result.safe).toBe(false);
    expect(result.risks).toContain('ssrf');
  });

  it('127.0.0.1 应标记 SSRF 风险', () => {
    const result = checker.check('http://127.0.0.1/secret');
    expect(result.safe).toBe(false);
    expect(result.risks).toContain('ssrf');
  });

  it('公网 IP 主机应标记 ip-host 风险', () => {
    const result = checker.check('https://8.8.8.8/path');
    expect(result.risks).toContain('ip-host');
    expect(result.riskLevel).toBe('medium');
  });

  it('可疑 TLD 应标记 suspicious-tld', () => {
    const result = checker.check('https://suspicious.zip/file');
    expect(result.risks).toContain('suspicious-tld');
  });

  it('URL 中包含凭据应标记 credentials-in-url', () => {
    const result = checker.check('https://user:pass@example.com/path');
    expect(result.risks).toContain('credentials-in-url');
    expect(result.riskLevel).toBe('high');
  });

  it('钓鱼关键词应标记 phishing', () => {
    const result = checker.check('https://fake-login.example.com/account/verify');
    expect(result.risks).toContain('phishing');
  });

  it('品牌仿冒应标记 phishing', () => {
    const result = checker.check('https://apple-login-secure.example.com/');
    expect(result.risks).toContain('phishing');
    expect(result.reasons.some((r) => r.includes('apple'))).toBe(true);
  });

  it('官方品牌域名不应被标记', () => {
    const result = checker.check('https://apple.com/iphone');
    expect(result.risks).not.toContain('phishing');
    expect(result.safe).toBe(true);
  });

  it('过多子域名应标记 excessive-subdomains', () => {
    const result = checker.check('https://a.b.c.d.e.f.example.com/');
    expect(result.risks).toContain('excessive-subdomains');
  });

  it('无效 URL 应标记 non-http', () => {
    const result = checker.check('not-a-url');
    expect(result.safe).toBe(false);
    expect(result.risks).toContain('non-http');
  });

  it('非 HTTP 协议应标记 non-http', () => {
    const result = checker.check('ftp://example.com/file');
    expect(result.risks).toContain('non-http');
  });

  it('risks 列表应去重', () => {
    // 同时触发 phishing 关键词和品牌仿冒
    const result = checker.check('https://apple-login.example.com/login');
    const phishingCount = result.risks.filter((r) => r === 'phishing').length;
    expect(phishingCount).toBe(1);
  });
});

describe('自定义选项', () => {
  it('应支持自定义可疑 TLD', () => {
    const checker = createLinkSafetyChecker({
      suspiciousTlds: ['.custom'],
    });
    const result = checker.check('https://test.custom/');
    expect(result.risks).toContain('suspicious-tld');
    // 默认的 .zip 不再触发
    const zipResult = checker.check('https://test.zip/');
    expect(zipResult.risks).not.toContain('suspicious-tld');
  });

  it('应支持自定义钓鱼关键词', () => {
    const checker = createLinkSafetyChecker({
      phishingKeywords: ['custom-bad-word'],
    });
    const result = checker.check('https://example.com/custom-bad-word');
    expect(result.risks).toContain('phishing');
  });

  it('应支持私有网络白名单', () => {
    const checker = createLinkSafetyChecker({
      privateNetworkAllowlist: ['10.0.0.1'],
    });
    const result = checker.check('http://10.0.0.1/internal');
    expect(result.risks).not.toContain('ssrf');
    expect(result.risks).not.toContain('private-network');
  });
});

describe('computeRiskLevel', () => {
  it('空风险列表返回 safe', () => {
    expect(computeRiskLevel([])).toBe('safe');
  });

  it('ssrf 返回 critical', () => {
    expect(computeRiskLevel(['ssrf'] as LinkRisk[])).toBe('critical');
  });

  it('phishing 返回 high', () => {
    expect(computeRiskLevel(['phishing'] as LinkRisk[])).toBe('high');
  });

  it('private-network 返回 medium', () => {
    expect(computeRiskLevel(['private-network'] as LinkRisk[])).toBe('medium');
  });

  it('suspicious-tld 返回 low', () => {
    expect(computeRiskLevel(['suspicious-tld'] as LinkRisk[])).toBe('low');
  });
});
