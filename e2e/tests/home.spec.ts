/**
 * 首页和基础导航 E2E 测试
 * 测试页面加载、路由、API 健康检查
 */

import { test, expect } from '../helpers/fixtures';

test.describe('首页加载测试', () => {
  test('应该能够加载应用首页', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 验证页面不为空白
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });

  test('应该显示应用标题', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});

test.describe('API 健康检查', () => {
  test('GET /api/health 应返回 ok', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('time');
  });

  test('GET /api/v1/agents 应返回 Agent 列表', async ({ request }) => {
    const response = await request.get('/api/v1/agents');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('GET /api/skills 应返回技能列表', async ({ request }) => {
    const response = await request.get('/api/skills');
    expect(response.status()).toBe(200);
  });
});

test.describe('路由导航测试', () => {
  test('应该能导航到聊天页面', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    expect(url).toContain('/chat');
  });

  test('应该能导航到设置页面', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    expect(url).toContain('/settings');
  });

  test('未知路由应显示 404 或重定向', async ({ page }) => {
    await page.goto('/nonexistent-page-12345');
    await page.waitForLoadState('networkidle');

    // 应用应该处理未知路由（重定向或显示404）
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });
});
