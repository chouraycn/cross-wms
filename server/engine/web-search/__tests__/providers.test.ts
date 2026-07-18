/**
 * Search Providers HTML 解析测试
 *
 * 测试各个搜索引擎 Provider 的 HTML 解析功能。
 */

import { describe, it, expect } from 'vitest';
import { parseBaiduHtml } from '../providers/baidu.js';
import { parseBingHtml } from '../providers/bing.js';
import { parseSogouHtml } from '../providers/sogou.js';
import { parseDuckDuckGoHtml } from '../providers/duckduckgo.js';
import { parseGoogleHtml } from '../providers/google.js';

describe('Baidu HTML Parser', () => {
  it('应能解析标准的百度搜索结果页面', () => {
    const html = `
      <html>
        <body>
          <div class="result">
            <h3><a href="https://example.com/page1">测试标题 1</a></h3>
            <div class="c-abstract">这是测试摘要 1，包含一些内容。</div>
          </div>
          <div class="result">
            <h3><a href="https://example.com/page2">测试标题 2</a></h3>
            <div class="c-abstract">这是测试摘要 2，包含更多内容。</div>
          </div>
        </body>
      </html>
    `;

    const results = parseBaiduHtml(html, 10);
    expect(results.length).toBe(2);
    expect(results[0].title).toBe('测试标题 1');
    expect(results[0].url).toBe('https://example.com/page1');
    expect(results[0].snippet).toContain('测试摘要 1');
    expect(results[0].source).toBe('baidu');
    expect(results[0].language).toBe('zh');
  });

  it('应遵守 maxResults 限制', () => {
    const html = `
      <html>
        <body>
          ${Array.from({ length: 10 }, (_, i) => `
            <div class="result">
              <h3><a href="https://example.com/page${i}">标题 ${i}</a></h3>
              <div class="c-abstract">摘要 ${i}</div>
            </div>
          `).join('')}
        </body>
      </html>
    `;

    const results = parseBaiduHtml(html, 3);
    expect(results.length).toBe(3);
  });

  it('没有摘要时仍应返回结果', () => {
    const html = `
      <html>
        <body>
          <div class="result">
            <h3><a href="https://example.com/page">没有摘要的标题</a></h3>
          </div>
        </body>
      </html>
    `;

    const results = parseBaiduHtml(html, 10);
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('没有摘要的标题');
    expect(results[0].url).toBe('https://example.com/page');
  });

  it('应处理百度重定向链接', () => {
    const html = `
      <html>
        <body>
          <div class="result">
            <h3><a href="https://www.baidu.com/link?url=https%3A%2F%2Fexample.com%2Ftarget">重定向链接</a></h3>
          </div>
        </body>
      </html>
    `;

    const results = parseBaiduHtml(html, 10);
    expect(results.length).toBe(1);
    expect(results[0].url).toContain('example.com');
  });

  it('空 HTML 应返回空结果', () => {
    const results = parseBaiduHtml('', 10);
    expect(results.length).toBe(0);
  });

  it('应去重相同 URL 的结果', () => {
    const html = `
      <html>
        <body>
          <div class="result">
            <h3><a href="https://example.com/page">重复标题 1</a></h3>
          </div>
          <div class="result">
            <h3><a href="https://example.com/page">重复标题 2</a></h3>
          </div>
        </body>
      </html>
    `;

    const results = parseBaiduHtml(html, 10);
    expect(results.length).toBe(1);
  });
});

describe('Bing HTML Parser', () => {
  it('应能解析标准的必应搜索结果页面', () => {
    const html = `
      <html>
        <body>
          <li class="b_algo">
            <h2><a href="https://example.com/page1">必应测试标题 1</a></h2>
            <div class="b_caption"><p>这是必应摘要 1。</p></div>
          </li>
          <li class="b_algo">
            <h2><a href="https://example.com/page2">必应测试标题 2</a></h2>
            <div class="b_caption"><p>这是必应摘要 2。</p></div>
          </li>
        </body>
      </html>
    `;

    const results = parseBingHtml(html, 10);
    expect(results.length).toBe(2);
    expect(results[0].title).toBe('必应测试标题 1');
    expect(results[0].url).toBe('https://example.com/page1');
    expect(results[0].snippet).toContain('必应摘要 1');
    expect(results[0].source).toBe('bing');
  });

  it('应遵守 maxResults 限制', () => {
    const html = `
      <html>
        <body>
          ${Array.from({ length: 10 }, (_, i) => `
            <li class="b_algo">
              <h2><a href="https://example.com/page${i}">标题 ${i}</a></h2>
            </li>
          `).join('')}
        </body>
      </html>
    `;

    const results = parseBingHtml(html, 5);
    expect(results.length).toBe(5);
  });

  it('空 HTML 应返回空结果', () => {
    const results = parseBingHtml('', 10);
    expect(results.length).toBe(0);
  });

  it('应过滤掉非 http 链接', () => {
    const html = `
      <html>
        <body>
          <li class="b_algo">
            <h2><a href="javascript:void(0)">无效链接</a></h2>
          </li>
          <li class="b_algo">
            <h2><a href="https://example.com/valid">有效链接</a></h2>
          </li>
        </body>
      </html>
    `;

    const results = parseBingHtml(html, 10);
    expect(results.length).toBe(1);
    expect(results[0].url).toBe('https://example.com/valid');
  });
});

describe('Sogou HTML Parser', () => {
    it('应能解析标准的搜狗搜索结果页面', () => {
      const html = `
        <html>
          <body>
            <div class="vrwrap">
              <h3><a href="/link?url=test1">搜狗测试标题 1</a></h3>
              <div class="str_info">这是搜狗搜索的测试摘要内容，用于验证解析功能是否正常工作。</div>
            </div>
            <div class="vrwrap">
              <h3><a href="/link?url=test2">搜狗测试标题 2</a></h3>
              <div class="str_info">这是第二个搜索结果的摘要内容，包含更多的文字信息。</div>
            </div>
          </body>
        </html>
      `;

      const results = parseSogouHtml(html, 10);
      expect(results.length).toBe(2);
      expect(results[0].title).toBe('搜狗测试标题 1');
      expect(results[0].url).toContain('sogou.com');
      expect(results[0].snippet).toContain('搜狗搜索的测试摘要');
      expect(results[0].source).toBe('sogou');
      expect(results[0].language).toBe('zh');
    });

  it('应遵守 maxResults 限制', () => {
    const html = `
      <html>
        <body>
          ${Array.from({ length: 10 }, (_, i) => `
            <div class="vrwrap">
              <h3><a href="/link?url=${i}">标题 ${i}</a></h3>
            </div>
          `).join('')}
        </body>
      </html>
    `;

    const results = parseSogouHtml(html, 3);
    expect(results.length).toBe(3);
  });

  it('空 HTML 应返回空结果', () => {
    const results = parseSogouHtml('', 10);
    expect(results.length).toBe(0);
  });
});

describe('DuckDuckGo HTML Parser', () => {
  it('应能解析标准的 DuckDuckGo 搜索结果页面', () => {
    const html = `
      <html>
        <body>
          <div class="result">
            <a class="result__a" href="https://example.com/page1">DDG 测试标题 1</a>
            <div class="result__snippet">这是 DDG 摘要 1。</div>
          </div>
          <div class="result">
            <a class="result__a" href="https://example.com/page2">DDG 测试标题 2</a>
            <div class="result__snippet">这是 DDG 摘要 2。</div>
          </div>
        </body>
      </html>
    `;

    const results = parseDuckDuckGoHtml(html, 10);
    expect(results.length).toBe(2);
    expect(results[0].title).toBe('DDG 测试标题 1');
    expect(results[0].url).toBe('https://example.com/page1');
    expect(results[0].snippet).toContain('DDG 摘要 1');
    expect(results[0].source).toBe('duckduckgo');
  });

  it('应遵守 maxResults 限制', () => {
    const html = `
      <html>
        <body>
          ${Array.from({ length: 10 }, (_, i) => `
            <div class="result">
              <a class="result__a" href="https://example.com/page${i}">标题 ${i}</a>
            </div>
          `).join('')}
        </body>
      </html>
    `;

    const results = parseDuckDuckGoHtml(html, 4);
    expect(results.length).toBe(4);
  });

  it('空 HTML 应返回空结果', () => {
    const results = parseDuckDuckGoHtml('', 10);
    expect(results.length).toBe(0);
  });
});

describe('Google HTML Parser', () => {
  it('应能解析标准的 Google 搜索结果页面', () => {
    const html = `
      <html>
        <body>
          <div class="g">
            <h3>Google 测试标题 1</h3>
            <a href="/url?q=https://example.com/page1">link</a>
            <div class="VwiC3b">这是 Google 摘要 1。</div>
          </div>
          <div class="g">
            <h3>Google 测试标题 2</h3>
            <a href="/url?q=https://example.com/page2">link</a>
            <div class="VwiC3b">这是 Google 摘要 2。</div>
          </div>
        </body>
      </html>
    `;

    const results = parseGoogleHtml(html, 10);
    expect(results.length).toBe(2);
    expect(results[0].title).toBe('Google 测试标题 1');
    expect(results[0].url).toBe('https://example.com/page1');
    expect(results[0].snippet).toContain('Google 摘要 1');
    expect(results[0].source).toBe('google');
  });

  it('应解析 /url?q= 格式的链接', () => {
    const html = `
      <html>
        <body>
          <div class="g">
            <h3>测试标题</h3>
            <a href="/url?q=https%3A%2F%2Fexample.com%2Fpage&sa=U">link</a>
          </div>
        </body>
      </html>
    `;

    const results = parseGoogleHtml(html, 10);
    expect(results.length).toBe(1);
    expect(results[0].url).toBe('https://example.com/page');
  });

  it('应遵守 maxResults 限制', () => {
    const html = `
      <html>
        <body>
          ${Array.from({ length: 10 }, (_, i) => `
            <div class="g">
              <h3>标题 ${i}</h3>
              <a href="/url?q=https://example.com/page${i}">link</a>
            </div>
          `).join('')}
        </body>
      </html>
    `;

    const results = parseGoogleHtml(html, 3);
    expect(results.length).toBe(3);
  });

  it('空 HTML 应返回空结果', () => {
    const results = parseGoogleHtml('', 10);
    expect(results.length).toBe(0);
  });
});
