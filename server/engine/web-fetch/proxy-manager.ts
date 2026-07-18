/**
 * Proxy Manager — 代理管理器
 *
 * 管理国内/海外代理切换，自动检测域名归属。
 */

import type { ProxyConfig, ProxyManagerConfig } from './types.js';
import { DOMESTIC_DOMAINS } from './types.js';
import { logger } from '../../logger.js';

class ProxyManager {
  private config: ProxyManagerConfig;

  constructor(config?: Partial<ProxyManagerConfig>) {
    this.config = {
      enabled: false,
      defaultProxyType: 'auto',
      autoDetectDomesticDomains: [...DOMESTIC_DOMAINS],
      ...config,
    };
  }

  getConfig(): ProxyManagerConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<ProxyManagerConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug(`Proxy manager config updated, enabled: ${this.config.enabled}`);
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  enable(): void {
    this.config.enabled = true;
    logger.info('Proxy manager enabled');
  }

  disable(): void {
    this.config.enabled = false;
    logger.info('Proxy manager disabled');
  }

  setDomesticProxy(proxy: ProxyConfig): void {
    this.config.domesticProxy = proxy;
    logger.debug('Domestic proxy configured');
  }

  setInternationalProxy(proxy: ProxyConfig): void {
    this.config.internationalProxy = proxy;
    logger.debug('International proxy configured');
  }

  isDomesticUrl(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();

      const domesticDomains = this.config.autoDetectDomesticDomains || DOMESTIC_DOMAINS;

      for (const domain of domesticDomains) {
        const cleanDomain = domain.toLowerCase().replace(/^\./, '');
        if (hostname === cleanDomain || hostname.endsWith('.' + cleanDomain)) {
          return true;
        }
      }

      if (hostname.endsWith('.cn')) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  getProxyForUrl(url: string, proxyType: 'domestic' | 'international' | 'auto' = 'auto'): ProxyConfig | null {
    if (!this.config.enabled) {
      return null;
    }

    let effectiveType: 'domestic' | 'international';

    if (proxyType === 'auto') {
      effectiveType = this.isDomesticUrl(url) ? 'domestic' : 'international';
    } else {
      effectiveType = proxyType;
    }

    const proxy = effectiveType === 'domestic'
      ? this.config.domesticProxy
      : this.config.internationalProxy;

    if (proxy) {
      logger.debug(`Using ${effectiveType} proxy for: ${url}`);
    }

    return proxy || null;
  }

  getProxyAgent(url: string, proxyType: 'domestic' | 'international' | 'auto' = 'auto'): string | null {
    const proxy = this.getProxyForUrl(url, proxyType);
    if (!proxy) return null;

    return this.buildProxyUrl(proxy);
  }

  private buildProxyUrl(proxy: ProxyConfig): string {
    let url = '';

    if (proxy.username && proxy.password) {
      url = `${proxy.type}://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.url}`;
    } else {
      url = `${proxy.type}://${proxy.url}`;
    }

    return url;
  }

  addDomesticDomain(domain: string): void {
    if (!this.config.autoDetectDomesticDomains) {
      this.config.autoDetectDomesticDomains = [];
    }
    if (!this.config.autoDetectDomesticDomains.includes(domain)) {
      this.config.autoDetectDomesticDomains.push(domain);
      logger.debug(`Added domestic domain: ${domain}`);
    }
  }

  removeDomesticDomain(domain: string): boolean {
    if (!this.config.autoDetectDomesticDomains) return false;
    const index = this.config.autoDetectDomesticDomains.indexOf(domain);
    if (index >= 0) {
      this.config.autoDetectDomesticDomains.splice(index, 1);
      logger.debug(`Removed domestic domain: ${domain}`);
      return true;
    }
    return false;
  }

  getDomesticDomains(): string[] {
    return [...(this.config.autoDetectDomesticDomains || [])];
  }

  reset(): void {
    this.config = {
      enabled: false,
      defaultProxyType: 'auto',
      autoDetectDomesticDomains: [...DOMESTIC_DOMAINS],
    };
    logger.debug('Proxy manager reset to default state');
  }
}

export const proxyManager = new ProxyManager();
export { ProxyManager };
export default ProxyManager;
