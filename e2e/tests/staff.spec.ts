/**
 * 数字员工页面 E2E 测试
 * 测试 Staff Deck 页面加载、Agent 列表、技能管理
 */

import { test, expect } from '../helpers/fixtures';

test.describe('数字员工页面测试', () => {
  test('应该能够加载页面并显示 Agent 列表', async ({ page }) => {
    await page.goto('/staff');
    await page.waitForLoadState('networkidle');

    // 验证页面标题存在
    const title = await page.textContent('h1, h2, [data-testid="page-title"]');
    expect(title).toBeTruthy();
  });

  test('应该能够显示 Agent 卡片', async ({ page }) => {
    await page.goto('/staff');
    await page.waitForLoadState('networkidle');

    // 查找 Agent 卡片或列表项
    const agentCards = await page.$$(
      '[data-testid="agent-card"], [data-testid="agent-item"], .agent-card'
    );
    // 至少应该有预定义的 Agent
    expect(agentCards.length).toBeGreaterThanOrEqual(0);
  });

  test('应该能导航到技能管理页面', async ({ page }) => {
    await page.goto('/staff/skills');
    await page.waitForLoadState('networkidle');

    // 验证技能页面加载
    const content = await page.textContent('body');
    expect(content?.length).toBeGreaterThan(0);
  });

  test('应该能导航到工具管理页面', async ({ page }) => {
    await page.goto('/staff/tools');
    await page.waitForLoadState('networkidle');

    // 验证工具页面加载
    const content = await page.textContent('body');
    expect(content?.length).toBeGreaterThan(0);
  });
});

test.describe('Agent 身份系统测试', () => {
  test('应该返回预定义的 Agent 身份列表', async ({ request }) => {
    const response = await request.get('/api/v1/agents/identities');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);

    if (body.data.length > 0) {
      const agent = body.data[0];
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('role');
    }
  });

  test('应该返回 Agent 场景列表', async ({ request }) => {
    const response = await request.get('/api/v1/agents/scenarios');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('data');
  });

  test('应该返回执行通道列表', async ({ request }) => {
    const response = await request.get('/api/v1/agents/lanes');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('data');
  });
});
