/**
 * Wiki 知识库页面 E2E 冒烟测试
 *
 * 说明：完整 Wiki CRUD UI 依赖大量 data-testid（wiki-item、create-wiki-button 等），
 * 这些在当前前端实现中不存在，且后端无独立 wiki API。本测试聚焦页面加载。
 */

import { test, expect } from '../helpers/fixtures';

test.describe('Wiki 页面加载测试', () => {
  test('应该能够加载 /wiki 页面', async ({ page }) => {
    await page.goto('/wiki');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });
});
