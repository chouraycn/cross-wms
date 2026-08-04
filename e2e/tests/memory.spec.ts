/**
 * 记忆系统 E2E 冒烟测试
 *
 * 说明：完整记忆 CRUD UI 依赖大量 data-testid（memory-item、add-memory-button 等），
 * 这些在当前前端实现中不存在。本测试聚焦页面加载与记忆 API 契约。
 */

import { test, expect } from '../helpers/fixtures';

test.describe('记忆页面加载测试', () => {
  test('应该能够加载 /memory 页面', async ({ page }) => {
    await page.goto('/memory');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });
});

test.describe('记忆 API 契约', () => {
  test('GET /api/memory 应返回 200', async ({ request }) => {
    const response = await request.get('/api/memory');
    expect(response.status()).toBe(200);
  });
});
