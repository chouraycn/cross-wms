/**
 * 数字员工 / Agent 系统 E2E 测试
 *
 * 说明：前端不存在 /staff 路由（实际路由为 /agents）。
 * 本测试聚焦：(1) /agents 页面可加载；(2) Agent 身份系统 API 契约。
 */

import { test, expect } from '../helpers/fixtures';

test.describe('数字员工页面加载测试', () => {
  test('应该能够加载 /agents 页面并渲染主体内容', async ({ page }) => {
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');

    // 验证页面不为空白
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });

  test('应该能够加载 /skills 页面', async ({ page }) => {
    await page.goto('/skills');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });

  test('应该能够加载 /automation 页面', async ({ page }) => {
    await page.goto('/automation');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });
});

test.describe('Agent 身份系统 API 契约', () => {
  test('GET /api/v1/agents/identities 应返回 data 数组', async ({ request }) => {
    const response = await request.get('/api/v1/agents/identities');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);

    if (body.data.length > 0) {
      const agent = body.data[0];
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('name');
    }
  });

  test('GET /api/v1/agents/scenarios 应返回 data', async ({ request }) => {
    const response = await request.get('/api/v1/agents/scenarios');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('data');
  });

  test('GET /api/v1/agents/lanes 应返回 data', async ({ request }) => {
    const response = await request.get('/api/v1/agents/lanes');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('data');
  });

  test('GET /api/v1/agents 应返回 Agent 列表', async ({ request }) => {
    const response = await request.get('/api/v1/agents');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });
});
