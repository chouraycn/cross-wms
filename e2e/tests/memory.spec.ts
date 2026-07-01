/**
 * 记忆系统 E2E 测试
 * 测试添加、删除、搜索、同步操作功能
 */

import { test, expect, MemoryPage } from '../helpers/fixtures';

test.describe('记忆系统功能测试', () => {
  let memoryPage: MemoryPage;

  test.beforeEach(async ({ page }) => {
    memoryPage = new MemoryPage(page);
    await memoryPage.goto();
  });

  test('应该能够添加新的记忆', async ({ page }) => {
    // 添加新记忆
    await memoryPage.addMemory('这是第一条测试记忆');

    // 等待记忆添加完成
    await page.waitForSelector('[data-testid="memory-item"]:last-child', {
      timeout: 5000,
    });

    // 验证记忆已添加
    const memories = await memoryPage.getMemories();
    const newMemory = memories.find(m => m.content === '这是第一条测试记忆');

    expect(newMemory).toBeTruthy();
    expect(newMemory?.type).toBe('fact');
  });

  test('应该能够添加不同类型的记忆', async ({ page }) => {
    // 添加事实类型记忆
    await page.click('[data-testid="add-memory-button"]');
    await page.fill('[data-testid="memory-content-input"]', '事实类型记忆');
    await page.selectOption('[data-testid="memory-type-select"]', 'fact');
    await page.click('[data-testid="memory-save-button"]');

    // 等待保存完成
    await page.waitForTimeout(1000);

    // 添加偏好类型记忆
    await page.click('[data-testid="add-memory-button"]');
    await page.fill('[data-testid="memory-content-input"]', '偏好类型记忆');
    await page.selectOption('[data-testid="memory-type-select"]', 'preference');
    await page.click('[data-testid="memory-save-button"]');

    // 等待保存完成
    await page.waitForTimeout(1000);

    // 验证记忆类型
    const memories = await memoryPage.getMemories();
    const factMemory = memories.find(m => m.content === '事实类型记忆');
    const preferenceMemory = memories.find(m => m.content === '偏好类型记忆');

    expect(factMemory?.type).toBe('fact');
    expect(preferenceMemory?.type).toBe('preference');
  });

  test('应该能够删除记忆', async ({ page }) => {
    // 首先添加一条记忆
    await memoryPage.addMemory('待删除的记忆');

    // 等待记忆添加完成
    await page.waitForSelector('[data-testid="memory-item"]:last-child', {
      timeout: 5000,
    });

    // 获取初始记忆数量
    const initialMemories = await memoryPage.getMemories();
    const initialCount = initialMemories.length;

    // 删除记忆
    await memoryPage.deleteMemory(0);

    // 等待删除完成
    await page.waitForTimeout(1000);

    // 验证记忆已删除
    const remainingMemories = await memoryPage.getMemories();
    expect(remainingMemories.length).toBe(initialCount - 1);
    expect(remainingMemories.find(m => m.content === '待删除的记忆')).toBeFalsy();
  });

  test('应该能够批量删除记忆', async ({ page }) => {
    // 添加多条记忆
    await memoryPage.addMemory('批量删除测试 1');
    await memoryPage.addMemory('批量删除测试 2');
    await memoryPage.addMemory('批量删除测试 3');

    // 等待记忆添加完成
    await page.waitForTimeout(2000);

    // 选择多条记忆
    await page.click('[data-testid="memory-item"][data-content="批量删除测试 1"] [data-testid="select-checkbox"]');
    await page.click('[data-testid="memory-item"][data-content="批量删除测试 2"] [data-testid="select-checkbox"]');

    // 点击批量删除按钮
    await page.click('[data-testid="batch-delete-button"]');

    // 等待删除完成
    await page.waitForTimeout(1000);

    // 验证批量删除结果
    const memories = await memoryPage.getMemories();
    expect(memories.find(m => m.content === '批量删除测试 1')).toBeFalsy();
    expect(memories.find(m => m.content === '批量删除测试 2')).toBeFalsy();
    expect(memories.find(m => m.content === '批量删除测试 3')).toBeTruthy();
  });

  test('应该能够搜索记忆', async ({ page }) => {
    // 添加多条记忆
    await memoryPage.addMemory('测试记忆：项目启动时间');
    await memoryPage.addMemory('其他记忆：用户偏好设置');
    await memoryPage.addMemory('测试记忆：项目进度更新');

    // 等待记忆添加完成
    await page.waitForTimeout(2000);

    // 执行搜索
    await memoryPage.search('测试');

    // 等待搜索结果
    await page.waitForSelector('[data-testid="memory-list"][data-search-active="true"]', {
      timeout: 5000,
    });

    // 验证搜索结果
    const memories = await memoryPage.getMemories();
    const matchingMemories = memories.filter(m => m.content?.includes('测试'));

    expect(matchingMemories.length).toBe(2);
    expect(memories.find(m => m.content?.includes('其他'))).toBeFalsy();
  });

  test('应该能够按类型筛选记忆', async ({ page }) => {
    // 添加不同类型的记忆
    await page.click('[data-testid="add-memory-button"]');
    await page.fill('[data-testid="memory-content-input"]', '事实记忆');
    await page.selectOption('[data-testid="memory-type-select"]', 'fact');
    await page.click('[data-testid="memory-save-button"]');

    await page.waitForTimeout(1000);

    await page.click('[data-testid="add-memory-button"]');
    await page.fill('[data-testid="memory-content-input"]', '偏好记忆');
    await page.selectOption('[data-testid="memory-type-select"]', 'preference');
    await page.click('[data-testid="memory-save-button"]');

    await page.waitForTimeout(1000);

    // 按类型筛选
    await page.click('[data-testid="filter-type-button"][data-type="fact"]');

    // 等待筛选结果
    await page.waitForSelector('[data-testid="memory-list"][data-filter-active="true"]', {
      timeout: 5000,
    });

    // 验证筛选结果
    const memories = await memoryPage.getMemories();
    expect(memories.find(m => m.content === '事实记忆')).toBeTruthy();
    expect(memories.find(m => m.content === '偏好记忆')).toBeFalsy();
  });

  test('应该能够同步记忆到服务器', async ({ page }) => {
    // 添加本地记忆
    await memoryPage.addMemory('需要同步的记忆');

    // 等待记忆添加完成
    await page.waitForSelector('[data-testid="memory-item"]:last-child', {
      timeout: 5000,
    });

    // 验证同步状态
    const memoryItem = await page.waitForSelector('[data-testid="memory-item"]:last-child');
    const syncStatus = await memoryItem.getAttribute('data-sync-status');

    // 初始状态应该是本地或待同步
    expect(syncStatus).toMatch(/local|pending/);

    // 点击同步按钮
    await page.click('[data-testid="sync-button"]');

    // 等待同步完成
    await page.waitForSelector('[data-testid="sync-success-indicator"]', {
      timeout: 10000,
    });

    // 验证同步状态更新
    const updatedMemoryItem = await page.waitForSelector('[data-testid="memory-item"]:last-child');
    const updatedSyncStatus = await updatedMemoryItem.getAttribute('data-sync-status');
    expect(updatedSyncStatus).toBe('synced');
  });

  test('应该能够处理同步失败', async ({ page }) => {
    // 添加记忆
    await memoryPage.addMemory('测试同步失败');

    // 模拟网络错误
    await page.route('**/api/memory/sync', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: '同步失败' }),
      });
    });

    // 点击同步按钮
    await page.click('[data-testid="sync-button"]');

    // 等待同步失败提示
    await page.waitForSelector('[data-testid="sync-error-indicator"]', {
      timeout: 5000,
    });

    // 验证错误信息
    const errorIndicator = await page.waitForSelector('[data-testid="sync-error-indicator"]');
    const errorText = await errorIndicator.textContent();
    expect(errorText).toContain('失败');

    // 验证重试按钮可用
    const retryButton = await page.waitForSelector('[data-testid="retry-sync-button"]');
    expect(retryButton).toBeTruthy();
  });

  test('应该能够查看记忆详情', async ({ page }) => {
    // 添加记忆
    await memoryPage.addMemory('详情测试记忆：包含详细信息的记忆条目');

    // 等待记忆添加完成
    await page.waitForSelector('[data-testid="memory-item"]:last-child', {
      timeout: 5000,
    });

    // 点击查看详情
    const memoryItem = await page.waitForSelector('[data-testid="memory-item"]:last-child');
    await memoryItem.click('[data-testid="view-detail-button"]');

    // 等待详情面板打开
    const detailPanel = await page.waitForSelector(
      '[data-testid="memory-detail-panel"]',
      { timeout: 5000 }
    );

    // 验证详情内容
    const detailContent = await detailPanel.$eval(
      '[data-testid="detail-content"]',
      el => el.textContent
    );
    expect(detailContent).toContain('详情测试记忆');

    // 验证详情元数据
    const detailMetadata = await detailPanel.$eval(
      '[data-testid="detail-metadata"]',
      el => el.textContent
    );
    expect(detailMetadata).toBeTruthy();
  });

  test('应该能够编辑记忆', async ({ page }) => {
    // 添加记忆
    await memoryPage.addMemory('原始记忆内容');

    // 等待记忆添加完成
    await page.waitForSelector('[data-testid="memory-item"]:last-child', {
      timeout: 5000,
    });

    // 点击编辑按钮
    const memoryItem = await page.waitForSelector('[data-testid="memory-item"]:last-child');
    await memoryItem.click('[data-testid="edit-memory-button"]');

    // 更新内容
    await page.fill('[data-testid="memory-content-input"]', '更新后的记忆内容');
    await page.click('[data-testid="memory-save-button"]');

    // 等待保存完成
    await page.waitForTimeout(1000);

    // 验证更新结果
    const memories = await memoryPage.getMemories();
    const updatedMemory = memories.find(m => m.content === '更新后的记忆内容');

    expect(updatedMemory).toBeTruthy();
    expect(memories.find(m => m.content === '原始记忆内容')).toBeFalsy();
  });

  test('应该能够导出记忆', async ({ page }) => {
    // 添加多条记忆
    await memoryPage.addMemory('导出测试记忆 1');
    await memoryPage.addMemory('导出测试记忆 2');

    // 等待记忆添加完成
    await page.waitForTimeout(2000);

    // 点击导出按钮
    await page.click('[data-testid="export-memory-button"]');

    // 等待导出格式选择对话框
    await page.waitForSelector('[data-testid="export-format-dialog"]', {
      timeout: 5000,
    });

    // 选择导出格式
    await page.click('[data-testid="export-format-json"]');

    // 等待导出完成
    const download = await page.waitForEvent('download', { timeout: 5000 });
    expect(download).toBeTruthy();

    // 验证文件名
    const fileName = download.suggestedFilename();
    expect(fileName).toMatch(/memories.*\.json/);
  });

  test('应该能够导入记忆', async ({ page }) => {
    // 点击导入按钮
    await page.click('[data-testid="import-memory-button"]');

    // 等待文件选择对话框
    const fileInput = await page.waitForSelector('[data-testid="import-file-input"]', {
      timeout: 5000,
    });

    // 模拟文件上传（这里需要准备一个测试文件）
    // await fileInput.setInputFiles('test-data/memories.json');

    // 等待导入完成
    await page.waitForSelector('[data-testid="import-success-indicator"]', {
      timeout: 10000,
    });

    // 验证导入结果
    const memories = await memoryPage.getMemories();
    expect(memories.length).toBeGreaterThan(0);
  });

  test('应该能够处理重复记忆', async ({ page }) => {
    // 添加第一条记忆
    await memoryPage.addMemory('重复记忆测试');

    // 等待记忆添加完成
    await page.waitForTimeout(1000);

    // 添加相同内容的记忆
    await memoryPage.addMemory('重复记忆测试');

    // 等待重复检测提示
    const duplicateWarning = await page.waitForSelector(
      '[data-testid="duplicate-memory-warning"]',
      { timeout: 3000 }
    );

    // 验证警告信息
    const warningText = await duplicateWarning.textContent();
    expect(warningText).toContain('重复');
  });

  test('应该能够设置记忆重要性', async ({ page }) => {
    // 添加记忆
    await memoryPage.addMemory('重要性测试记忆');

    // 等待记忆添加完成
    await page.waitForSelector('[data-testid="memory-item"]:last-child', {
      timeout: 5000,
    });

    // 设置重要性
    const memoryItem = await page.waitForSelector('[data-testid="memory-item"]:last-child');
    await memoryItem.locator('[data-testid="set-importance-button"]').click();

    // 选择重要性级别
    await page.click('[data-testid="importance-high"]');

    // 等待设置完成
    await page.waitForTimeout(1000);

    // 验证重要性标记
    const importanceIndicator = await memoryItem.$('[data-testid="importance-indicator"]');
    const importanceLevel = await importanceIndicator.getAttribute('data-level');
    expect(importanceLevel).toBe('high');
  });

  test('应该能够按重要性筛选记忆', async ({ page }) => {
    // 添加不同重要性的记忆
    await memoryPage.addMemory('高重要性记忆');
    const highMemory = await page.waitForSelector('[data-testid="memory-item"]:last-child');
    await highMemory.locator('[data-testid="set-importance-button"]').click();
    await page.click('[data-testid="importance-high"]');

    await page.waitForTimeout(1000);

    await memoryPage.addMemory('普通重要性记忆');

    await page.waitForTimeout(1000);

    // 按重要性筛选
    await page.click('[data-testid="filter-importance-button"][data-level="high"]');

    // 等待筛选结果
    await page.waitForSelector('[data-testid="memory-list"][data-filter-active="true"]', {
      timeout: 5000,
    });

    // 验证筛选结果
    const memories = await memoryPage.getMemories();
    expect(memories.find(m => m.content === '高重要性记忆')).toBeTruthy();
    expect(memories.find(m => m.content === '普通重要性记忆')).toBeFalsy();
  });
});