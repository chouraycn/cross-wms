/**
 * Proxy Manager 单元测试
 *
 * 测试代理管理器的各种功能。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProxyManager } from '../proxy-manager.js';
import type { ProxyConfig } from '../types.js';

vi.mock('../../logger.js', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('Proxy Manager', () => {
  let proxyManager: ProxyManager;

  beforeEach(() => {
    proxyManager = new ProxyManager();
  });

  describe('初始化', () => {
    it('默认应禁用代理', () => {
      expect(proxyManager.isEnabled()).toBe(false);
    });

    it('默认应有国内域名列表', () => {
      const domains = proxyManager.getDomesticDomains();
      expect(domains.length).toBeGreaterThan(0);
    });
  });

  describe('启用和禁用', () => {
    it('应能启用代理', () => {
      proxyManager.enable();
      expect(proxyManager.isEnabled()).toBe(true);
    });

    it('应能禁用代理', () => {
      proxyManager.enable();
      proxyManager.disable();
      expect(proxyManager.isEnabled()).toBe(false);
    });
  });

  describe('国内域名检测', () => {
    it('应正确识别 .cn 域名为国内', () => {
      expect(proxyManager.isDomesticUrl('https://www.example.cn')).toBe(true);
      expect(proxyManager.isDomesticUrl('https://www.example.com.cn')).toBe(true);
    });

    it('应正确识别常见国内网站为国内', () => {
      expect(proxyManager.isDomesticUrl('https://www.baidu.com')).toBe(true);
      expect(proxyManager.isDomesticUrl('https://www.zhihu.com')).toBe(true);
      expect(proxyManager.isDomesticUrl('https://www.bilibili.com')).toBe(true);
    });

    it('应正确识别国际网站为非国内', () => {
      expect(proxyManager.isDomesticUrl('https://www.google.com')).toBe(false);
      expect(proxyManager.isDomesticUrl('https://www.github.com')).toBe(false);
    });

    it('无效 URL 应返回 false', () => {
      expect(proxyManager.isDomesticUrl('not-a-url')).toBe(false);
      expect(proxyManager.isDomesticUrl('')).toBe(false);
    });

    it('子域名应能正确匹配', () => {
      expect(proxyManager.isDomesticUrl('https://news.baidu.com')).toBe(true);
      expect(proxyManager.isDomesticUrl('https://www.zhihu.com/question/123')).toBe(true);
    });
  });

  describe('代理配置', () => {
    beforeEach(() => {
      proxyManager.enable();
    });

    it('应能设置国内代理', () => {
      const proxy: ProxyConfig = {
        url: 'proxy.example.com:8080',
        type: 'http',
      };

      proxyManager.setDomesticProxy(proxy);
      const result = proxyManager.getProxyForUrl('https://www.baidu.com', 'domestic');
      expect(result).toEqual(proxy);
    });

    it('应能设置国际代理', () => {
      const proxy: ProxyConfig = {
        url: 'intl-proxy.example.com:8080',
        type: 'socks5',
      };

      proxyManager.setInternationalProxy(proxy);
      const result = proxyManager.getProxyForUrl('https://www.google.com', 'international');
      expect(result).toEqual(proxy);
    });

    it('auto 模式下国内域名应使用国内代理', () => {
      const domesticProxy: ProxyConfig = {
        url: 'cn-proxy.example.com:8080',
        type: 'http',
      };
      const intlProxy: ProxyConfig = {
        url: 'intl-proxy.example.com:8080',
        type: 'http',
      };

      proxyManager.setDomesticProxy(domesticProxy);
      proxyManager.setInternationalProxy(intlProxy);

      const result = proxyManager.getProxyForUrl('https://www.baidu.com', 'auto');
      expect(result?.url).toBe('cn-proxy.example.com:8080');
    });

    it('auto 模式下国际域名应使用国际代理', () => {
      const domesticProxy: ProxyConfig = {
        url: 'cn-proxy.example.com:8080',
        type: 'http',
      };
      const intlProxy: ProxyConfig = {
        url: 'intl-proxy.example.com:8080',
        type: 'http',
      };

      proxyManager.setDomesticProxy(domesticProxy);
      proxyManager.setInternationalProxy(intlProxy);

      const result = proxyManager.getProxyForUrl('https://www.google.com', 'auto');
      expect(result?.url).toBe('intl-proxy.example.com:8080');
    });

    it('禁用代理时应返回 null', () => {
      const proxy: ProxyConfig = {
        url: 'proxy.example.com:8080',
        type: 'http',
      };

      proxyManager.setDomesticProxy(proxy);
      proxyManager.disable();

      const result = proxyManager.getProxyForUrl('https://www.baidu.com', 'domestic');
      expect(result).toBeNull();
    });

    it('未配置对应代理时应返回 null', () => {
      const result = proxyManager.getProxyForUrl('https://www.google.com', 'international');
      expect(result).toBeNull();
    });
  });

  describe('代理 URL 构建', () => {
    beforeEach(() => {
      proxyManager.enable();
    });

    it('无认证的代理 URL 应正确构建', () => {
      const proxy: ProxyConfig = {
        url: 'proxy.example.com:8080',
        type: 'http',
      };

      proxyManager.setInternationalProxy(proxy);
      const agent = proxyManager.getProxyAgent('https://google.com', 'international');
      expect(agent).toBe('http://proxy.example.com:8080');
    });

    it('带认证的代理 URL 应正确构建', () => {
      const proxy: ProxyConfig = {
        url: 'proxy.example.com:8080',
        type: 'socks5',
        username: 'user',
        password: 'pass',
      };

      proxyManager.setInternationalProxy(proxy);
      const agent = proxyManager.getProxyAgent('https://google.com', 'international');
      expect(agent).toContain('socks5://');
      expect(agent).toContain('user:pass@');
    });

    it('禁用代理时 getProxyAgent 应返回 null', () => {
      proxyManager.disable();
      const agent = proxyManager.getProxyAgent('https://google.com', 'international');
      expect(agent).toBeNull();
    });
  });

  describe('国内域名管理', () => {
    it('应能添加国内域名', () => {
      proxyManager.addDomesticDomain('custom-example.com');
      expect(proxyManager.isDomesticUrl('https://www.custom-example.com')).toBe(true);
    });

    it('应能移除国内域名', () => {
      proxyManager.addDomesticDomain('to-remove.com');
      expect(proxyManager.isDomesticUrl('https://www.to-remove.com')).toBe(true);

      const result = proxyManager.removeDomesticDomain('to-remove.com');
      expect(result).toBe(true);
      expect(proxyManager.isDomesticUrl('https://www.to-remove.com')).toBe(false);
    });

    it('移除不存在的域名应返回 false', () => {
      const result = proxyManager.removeDomesticDomain('non-existent.com');
      expect(result).toBe(false);
    });

    it('getDomesticDomains 应返回副本', () => {
      const domains = proxyManager.getDomesticDomains();
      domains.push('test.com');
      expect(proxyManager.getDomesticDomains()).not.toContain('test.com');
    });
  });

  describe('配置管理', () => {
    it('应能获取配置副本', () => {
      const config = proxyManager.getConfig();
      config.enabled = true;
      expect(proxyManager.isEnabled()).toBe(false);
    });

    it('应能更新配置', () => {
      proxyManager.setConfig({ enabled: true, defaultProxyType: 'domestic' });
      expect(proxyManager.isEnabled()).toBe(true);
      expect(proxyManager.getConfig().defaultProxyType).toBe('domestic');
    });
  });

  describe('重置', () => {
    it('reset 应重置为默认状态', () => {
      proxyManager.enable();
      proxyManager.addDomesticDomain('custom.com');
      proxyManager.setDomesticProxy({ url: 'proxy.com', type: 'http' });

      proxyManager.reset();

      expect(proxyManager.isEnabled()).toBe(false);
      expect(proxyManager.isDomesticUrl('https://custom.com')).toBe(false);
      expect(proxyManager.getProxyForUrl('https://baidu.com', 'domestic')).toBeNull();
    });
  });
});
