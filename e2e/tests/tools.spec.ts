/**
 * 工具管理页面 E2E 冒烟测试
 *
 * 说明：前端不存在 /tools 路由，也无 pdf-reader/file-read 等工具卡片 UI。
 * 实际工具管理分散在 /extensions-center（扩展与 MCP）、/mcp（MCP 服务器）、
 * /lsp（语言服务）。本测试聚焦这些页面的可加载性与相关 API 契约。
 */

import { test, expect } from '../helpers/fixtures';

test.describe('工具管理页面加载测试', () => {
  test('应该能够加载 /extensions-center 页面', async ({ page }) => {
    await page.goto('/extensions-center');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });

  test('应该能够加载 /mcp 页面', async ({ page }) => {
    await page.goto('/mcp');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });

  test('应该能够加载 /lsp 页面', async ({ page }) => {
    await page.goto('/lsp');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });

  test('应该能够加载 /skills 页面（技能即工具来源）', async ({ page }) => {
    await page.goto('/skills');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });
});

test.describe('工具相关 API 契约', () => {
  test('GET /api/skills 应返回 200', async ({ request }) => {
    const response = await request.get('/api/skills');
    expect(response.status()).toBe(200);
  });

  test('GET /api/user-skills 应返回 200', async ({ request }) => {
    const response = await request.get('/api/user-skills');
    expect(response.status()).toBe(200);
  });
});
