/**
 * Link Extractor 单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  extractLinksFromMessage,
  extractLinkInfos,
  parseLinkInfo,
  extractDomain,
  isIpHost,
} from '../extractor.js';

describe('extractLinksFromMessage', () => {
  it('应提取裸 HTTP/HTTPS URL 并保持顺序', () => {
    const links = extractLinksFromMessage('看 https://a.example 和 http://b.test');
    expect(links).toEqual(['https://a.example', 'http://b.test']);
  });

  it('应去重并限制 maxLinks', () => {
    const links = extractLinksFromMessage(
      'https://a.example https://a.example https://b.test',
      { maxLinks: 1 },
    );
    expect(links).toEqual(['https://a.example']);
  });

  it('应忽略 Markdown 链接语法', () => {
    const links = extractLinksFromMessage('[doc](https://docs.example) https://bare.example');
    expect(links).toEqual(['https://bare.example']);
  });

  it('应过滤内网地址', () => {
    expect(extractLinksFromMessage('http://127.0.0.1/test https://ok.test')).toEqual([
      'https://ok.test',
    ]);
    expect(extractLinksFromMessage('http://localhost/secret')).toEqual([]);
    expect(extractLinksFromMessage('http://10.0.0.1/internal')).toEqual([]);
    expect(extractLinksFromMessage('http://192.168.1.1/internal')).toEqual([]);
  });

  it('应允许合法的公网 URL', () => {
    expect(extractLinksFromMessage('https://example.com/page')).toEqual([
      'https://example.com/page',
    ]);
    expect(extractLinksFromMessage('https://8.8.8.8/dns')).toEqual(['https://8.8.8.8/dns']);
  });

  it('空字符串返回空数组', () => {
    expect(extractLinksFromMessage('')).toEqual([]);
    expect(extractLinksFromMessage('   ')).toEqual([]);
  });

  it('无链接时返回空数组', () => {
    expect(extractLinksFromMessage('这是一段没有链接的文本')).toEqual([]);
  });

  it('filterPrivate 为 false 时保留内网链接', () => {
    const links = extractLinksFromMessage('http://127.0.0.1/test', { filterPrivate: false });
    expect(links).toEqual(['http://127.0.0.1/test']);
  });

  it('应处理带端口和路径的 URL', () => {
    const links = extractLinksFromMessage('https://example.com:8080/api/v1?id=1#section');
    expect(links).toEqual(['https://example.com:8080/api/v1?id=1#section']);
  });
});

describe('parseLinkInfo', () => {
  it('应正确解析标准 URL', () => {
    const info = parseLinkInfo('https://example.com:8080/path?q=1#hash');
    expect(info).not.toBeNull();
    expect(info!.protocol).toBe('https');
    expect(info!.hostname).toBe('example.com');
    expect(info!.port).toBe(8080);
    expect(info!.pathname).toBe('/path');
    expect(info!.search).toBe('?q=1');
    expect(info!.hash).toBe('#hash');
    expect(info!.domain).toBe('example.com');
    expect(info!.isPrivate).toBe(false);
  });

  it('应识别内网 IP 为 private', () => {
    const info = parseLinkInfo('http://10.0.0.1/internal');
    expect(info!.isPrivate).toBe(true);
  });

  it('应识别 localhost 为 private', () => {
    const info = parseLinkInfo('http://localhost/path');
    expect(info!.isPrivate).toBe(true);
  });

  it('无效 URL 返回 null', () => {
    expect(parseLinkInfo('not-a-url')).toBeNull();
    expect(parseLinkInfo('')).toBeNull();
  });

  it('无路径时 pathname 默认为 /', () => {
    const info = parseLinkInfo('https://example.com');
    expect(info!.pathname).toBe('/');
  });
});

describe('extractDomain', () => {
  it('应提取标准二级域名', () => {
    expect(extractDomain('example.com')).toBe('example.com');
    expect(extractDomain('sub.example.com')).toBe('example.com');
  });

  it('应处理多段 TLD（如 .com.cn）', () => {
    expect(extractDomain('site.com.cn')).toBe('site.com.cn');
    expect(extractDomain('sub.site.com.cn')).toBe('site.com.cn');
  });

  it('应处理 .co.uk', () => {
    expect(extractDomain('site.co.uk')).toBe('site.co.uk');
  });

  it('单段主机名返回 undefined', () => {
    expect(extractDomain('localhost')).toBeUndefined();
  });
});

describe('isIpHost', () => {
  it('应识别 IPv4 地址', () => {
    expect(isIpHost('8.8.8.8')).toBe(true);
    expect(isIpHost('192.168.1.1')).toBe(true);
  });

  it('应识别 IPv6 地址（含冒号）', () => {
    expect(isIpHost('::1')).toBe(true);
  });

  it('域名应返回 false', () => {
    expect(isIpHost('example.com')).toBe(false);
  });
});

describe('extractLinkInfos', () => {
  it('应返回结构化 LinkInfo 列表', () => {
    const infos = extractLinkInfos('https://a.example https://b.test');
    expect(infos).toHaveLength(2);
    expect(infos[0].hostname).toBe('a.example');
    expect(infos[1].hostname).toBe('b.test');
  });

  it('应遵守 maxLinks 限制', () => {
    const infos = extractLinkInfos('https://a.example https://b.test https://c.test', {
      maxLinks: 2,
    });
    expect(infos).toHaveLength(2);
  });
});
