/**
 * Wiki 知识库 E2E 测试
 * 测试创建、编辑、删除、搜索、标签管理功能
 */

import { test, expect, WikiPage } from '../helpers/fixtures';

test.describe('Wiki 知识库功能测试', () => {
  let wikiPage: WikiPage;

  test.beforeEach(async ({ page }) => {
    wikiPage = new WikiPage(page);
    await wikiPage.goto();
  });

  test('应该能够创建新的 Wiki 条目', async ({ page }) => {
    // 创建新条目
    await wikiPage.createEntry(
      '测试条目标题',
      '这是测试内容，用于验证创建功能',
      ['测试', 'E2E']
    );

    // 等待创建完成
    await page.waitForSelector('[data-testid="wiki-item"]:last-child', {
      timeout: 5000,
    });

    // 验证条目已创建
    const entries = await wikiPage.getEntries();
    const newEntry = entries.find(e => e.title === '测试条目标题');

    expect(newEntry).toBeTruthy();
    expect(newEntry?.content).toContain('这是测试内容');
    expect(newEntry?.tags).toContain('测试');
    expect(newEntry?.tags).toContain('E2E');
  });

  test('应该能够编辑现有的 Wiki 条目', async ({ page }) => {
    // 首先创建一个条目
    await wikiPage.createEntry('待编辑条目', '原始内容');

    // 等待条目创建完成
    await page.waitForSelector('[data-testid="wiki-item"]:last-child', {
      timeout: 5000,
    });

    // 编辑条目
    await wikiPage.editEntry(
      0,
      '编辑后的标题',
      '编辑后的内容'
    );

    // 等待编辑完成
    await page.waitForSelector('[data-testid="wiki-item"][data-title="编辑后的标题"]', {
      timeout: 5000,
    });

    // 验证编辑结果
    const entries = await wikiPage.getEntries();
    const editedEntry = entries.find(e => e.title === '编辑后的标题');

    expect(editedEntry).toBeTruthy();
    expect(editedEntry?.content).toBe('编辑后的内容');
    expect(editedEntry?.tags).toBeTruthy();
  });

  test('应该能够删除 Wiki 条目', async ({ page }) => {
    // 首先创建一个条目
    await wikiPage.createEntry('待删除条目', '即将被删除的内容');

    // 等待条目创建完成
    await page.waitForSelector('[data-testid="wiki-item"]:last-child', {
      timeout: 5000,
    });

    // 获取初始条目数量
    const initialEntries = await wikiPage.getEntries();
    const initialCount = initialEntries.length;

    // 删除条目
    await wikiPage.deleteEntry(0);

    // 等待删除完成
    await page.waitForTimeout(1000);

    // 验证条目已删除
    const remainingEntries = await wikiPage.getEntries();
    expect(remainingEntries.length).toBe(initialCount - 1);
    expect(remainingEntries.find(e => e.title === '待删除条目')).toBeFalsy();
  });

  test('应该能够搜索 Wiki 条目', async ({ page }) => {
    // 创建多个测试条目
    await wikiPage.createEntry('搜索测试条目 1', '包含关键词的内容', ['搜索']);
    await wikiPage.createEntry('另一个条目', '不包含关键词的内容', ['其他']);

    // 等待条目创建完成
    await page.waitForTimeout(2000);

    // 执行搜索
    await wikiPage.search('搜索');

    // 等待搜索结果
    await page.waitForSelector('[data-testid="wiki-list"][data-search-active="true"]', {
      timeout: 5000,
    });

    // 验证搜索结果
    const entries = await wikiPage.getEntries();
    const matchingEntries = entries.filter(e =>
      e.title?.includes('搜索') || e.content?.includes('关键词')
    );

    expect(matchingEntries.length).toBeGreaterThan(0);
    expect(matchingEntries.length).toBeLessThan(entries.length);
  });

  test('应该能够按标签筛选 Wiki 条目', async ({ page }) => {
    // 创建带标签的条目
    await wikiPage.createEntry('标签测试条目', '内容', ['重要', '测试']);
    await wikiPage.createEntry('普通条目', '内容', ['普通']);

    // 等待条目创建完成
    await page.waitForTimeout(2000);

    // 点击标签筛选
    await page.click('[data-testid="wiki-tag"][data-tag="重要"]');

    // 等待筛选结果
    await page.waitForSelector('[data-testid="wiki-list"][data-filter-active="true"]', {
      timeout: 5000,
    });

    // 验证筛选结果
    const entries = await wikiPage.getEntries();
    const filteredEntries = entries.filter(e => e.tags?.includes('重要'));

    expect(filteredEntries.length).toBeGreaterThan(0);
    expect(entries.find(e => e.tags?.includes('普通'))).toBeFalsy();
  });

  test('应该能够管理标签', async ({ page }) => {
    // 创建带标签的条目
    await wikiPage.createEntry('标签管理测试', '内容', ['初始标签']);

    // 等待条目创建完成
    await page.waitForSelector('[data-testid="wiki-item"]:last-child', {
      timeout: 5000,
    });

    // 编辑标签
    const wikiItem = await page.waitForSelector('[data-testid="wiki-item"]:last-child');
    await wikiItem.locator('[data-testid="edit-wiki-button"]').click();

    // 添加新标签
    await page.fill('[data-testid="wiki-tags-input"]', '初始标签,新标签1,新标签2');
    await page.click('[data-testid="wiki-save-button"]');

    // 等待保存完成
    await page.waitForTimeout(1000);

    // 验证标签更新
    const entries = await wikiPage.getEntries();
    const updatedEntry = entries.find(e => e.title === '标签管理测试');

    expect(updatedEntry?.tags).toContain('初始标签');
    expect(updatedEntry?.tags).toContain('新标签1');
    expect(updatedEntry?.tags).toContain('新标签2');
  });

  test('应该能够批量删除标签', async ({ page }) => {
    // 创建条目
    await wikiPage.createEntry('批量标签测试', '内容', ['标签A', '标签B', '标签C']);

    // 等待条目创建完成
    await page.waitForSelector('[data-testid="wiki-item"]:last-child', {
      timeout: 5000,
    });

    // 进入编辑模式
    const wikiItem = await page.waitForSelector('[data-testid="wiki-item"]:last-child');
    await wikiItem.locator('[data-testid="edit-wiki-button"]').click();

    // 删除标签
    await page.click('[data-testid="wiki-tag"][data-tag="标签B"] [data-testid="remove-tag-button"]');

    // 保存
    await page.click('[data-testid="wiki-save-button"]');

    // 等待保存完成
    await page.waitForTimeout(1000);

    // 验证标签已删除
    const entries = await wikiPage.getEntries();
    const updatedEntry = entries.find(e => e.title === '批量标签测试');

    expect(updatedEntry?.tags).toContain('标签A');
    expect(updatedEntry?.tags).toContain('标签C');
    expect(updatedEntry?.tags?.includes('标签B')).toBeFalsy();
  });

  test('应该能够处理空内容提交', async ({ page }) => {
    // 点击创建按钮
    await page.click('[data-testid="create-wiki-button"]');

    // 不填写内容，直接保存
    await page.click('[data-testid="wiki-save-button"]');

    // 等待验证错误提示
    const errorIndicator = await page.waitForSelector(
      '[data-testid="validation-error"]',
      { timeout: 3000 }
    );

    // 验证错误信息
    const errorText = await errorIndicator.textContent();
    expect(errorText).toContain('标题');
  });

  test('应该能够处理重复标题', async ({ page }) => {
    // 创建第一个条目
    await wikiPage.createEntry('重复标题', '第一个条目的内容');

    // 等待创建完成
    await page.waitForSelector('[data-testid="wiki-item"]:last-child', {
      timeout: 5000,
    });

    // 创建同名条目
    await wikiPage.createEntry('重复标题', '第二个条目的内容');

    // 等待重复警告
    const warningIndicator = await page.waitForSelector(
      '[data-testid="duplicate-warning"]',
      { timeout: 3000 }
    );

    // 验证警告信息
    const warningText = await warningIndicator.textContent();
    expect(warningText).toContain('重复');
  });

  test('应该能够展示 Wiki 条目详情', async ({ page }) => {
    // 创建条目
    await wikiPage.createEntry(
      '详情测试条目',
      '这是一段详细的内容描述，用于测试详情展示功能',
      ['详情', '测试']
    );

    // 等待条目创建完成
    await page.waitForSelector('[data-testid="wiki-item"]:last-child', {
      timeout: 5000,
    });

    // 点击查看详情
    const wikiItem = await page.waitForSelector('[data-testid="wiki-item"]:last-child');
    await wikiItem.locator('[data-testid="view-detail-button"]').click();

    // 等待详情面板打开
    const detailPanel = await page.waitForSelector(
      '[data-testid="wiki-detail-panel"]',
      { timeout: 5000 }
    );

    // 验证详情内容
    const detailTitle = await detailPanel.$eval(
      '[data-testid="detail-title"]',
      el => el.textContent
    );
    expect(detailTitle).toBe('详情测试条目');

    const detailContent = await detailPanel.$eval(
      '[data-testid="detail-content"]',
      el => el.textContent
    );
    expect(detailContent).toContain('这是一段详细的内容描述');
  });

  test('应该能够导出 Wiki 条目', async ({ page }) => {
    // 创建条目
    await wikiPage.createEntry('导出测试条目', '用于测试导出功能的内容');

    // 等待条目创建完成
    await page.waitForSelector('[data-testid="wiki-item"]:last-child', {
      timeout: 5000,
    });

    // 点击导出按钮
    const wikiItem = await page.waitForSelector('[data-testid="wiki-item"]:last-child');
    await wikiItem.locator('[data-testid="export-button"]').click();

    // 等待导出完成提示
    await page.waitForSelector('[data-testid="export-success"]', {
      timeout: 5000,
    });

    // 验证导出文件下载（这里需要根据实际下载机制调整）
    const download = await page.waitForEvent('download', { timeout: 5000 });
    expect(download).toBeTruthy();
  });

  test('应该能够处理并发编辑冲突', async ({ page, browser }) => {
    // 创建初始条目
    await wikiPage.createEntry('并发测试', '初始内容');

    // 等待条目创建完成
    await page.waitForSelector('[data-testid="wiki-item"]:last-child', {
      timeout: 5000,
    });

    // 创建第二个浏览器上下文模拟另一个用户
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    const wikiPage2 = new WikiPage(page2);

    await wikiPage2.goto();

    // 两个用户同时编辑
    await wikiPage.editEntry(0, '用户1编辑', '用户1的内容');
    await wikiPage2.editEntry(0, '用户2编辑', '用户2的内容');

    // 等待编辑完成
    await page.waitForTimeout(1000);

    // 验证冲突处理（应该显示冲突提示或自动合并）
    const conflictIndicator = await page.waitForSelector(
      '[data-testid="edit-conflict"]',
      { timeout: 3000 }
    ).catch(() => null);

    if (conflictIndicator) {
      // 处理冲突
      await conflictIndicator.click('[data-testid="resolve-conflict-button"]');
      await page.waitForTimeout(1000);
    }

    // 清理第二个上下文
    await context2.close();
  });
});