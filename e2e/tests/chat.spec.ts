/**
 * 聊天场景 E2E 测试
 * 测试消息发送、接收、流式输出、工具调用、审批流程
 */

import { test, expect, ChatPage } from '../helpers/fixtures';

test.describe('聊天功能测试', () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
  });

  test('应该能够发送消息并接收回复', async ({ page }) => {
    // 发送测试消息
    await chatPage.sendMessage('你好，这是一个测试消息');

    // 等待响应
    await chatPage.waitForResponse();

    // 验证消息列表
    const messages = await chatPage.getMessages();
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  test('应该能够展示流式输出', async ({ page }) => {
    // 发送消息触发流式响应
    await chatPage.sendMessage('请给我讲一个故事');

    // 等待流式输出开始
    await page.waitForSelector('[data-testid="streaming-indicator"]', {
      timeout: 5000,
    });

    // 等待流式输出完成
    await chatPage.waitForStreamingComplete();

    // 验证最终消息内容
    const messages = await chatPage.getMessages();
    const lastMessage = messages[messages.length - 1];
    expect(lastMessage.role).toBe('assistant');
    expect(lastMessage.content?.length).toBeGreaterThan(0);
  });

  test('应该能够处理工具调用并展示结果', async ({ page }) => {
    // 发送需要工具调用的消息
    await chatPage.sendMessage('帮我读取 PDF 文件 /path/to/file.pdf');

    // 等待工具卡片出现
    const toolCard = await page.waitForSelector('[data-testid="tool-card"]', {
      timeout: 10000,
    });

    // 验证工具信息
    const toolName = await toolCard.getAttribute('data-tool');
    expect(toolName).toBe('pdf-reader');

    // 验证工具状态
    const toolStatus = await toolCard.getAttribute('data-status');
    expect(toolStatus).toMatch(/pending|executing|completed/);

    // 等待工具执行完成
    await page.waitForSelector('[data-testid="tool-card"][data-status="completed"]', {
      timeout: 15000,
    });
  });

  test('应该能够处理审批流程 - 同意', async ({ page }) => {
    // 发送需要审批的消息
    await chatPage.sendMessage('执行需要审批的操作');

    // 等待审批对话框出现
    const approvalDialog = await page.waitForSelector(
      '[data-testid="approval-dialog"]',
      { timeout: 5000 }
    );

    // 验证审批类型
    const approvalType = await approvalDialog.getAttribute('data-type');
    expect(approvalType).toBeTruthy();

    // 点击同意按钮
    await approvalDialog.locator('[data-testid="approve-button"]').click();

    // 等待对话框消失
    await page.waitForSelector('[data-testid="approval-dialog"]', {
      state: 'hidden',
      timeout: 3000,
    });

    // 验证审批结果
    const approvalResult = await page.waitForSelector(
      '[data-testid="approval-result"][data-status="approved"]',
      { timeout: 5000 }
    );
    expect(approvalResult).toBeTruthy();
  });

  test('应该能够处理审批流程 - 拒绝', async ({ page }) => {
    // 发送需要审批的消息
    await chatPage.sendMessage('执行需要审批的操作');

    // 等待审批对话框出现
    const approvalDialog = await page.waitForSelector(
      '[data-testid="approval-dialog"]',
      { timeout: 5000 }
    );

    // 点击拒绝按钮
    await approvalDialog.locator('[data-testid="reject-button"]').click();

    // 等待对话框消失
    await page.waitForSelector('[data-testid="approval-dialog"]', {
      state: 'hidden',
      timeout: 3000,
    });

    // 验证审批结果
    const approvalResult = await page.waitForSelector(
      '[data-testid="approval-result"][data-status="rejected"]',
      { timeout: 5000 }
    );
    expect(approvalResult).toBeTruthy();
  });

  test('应该能够处理错误情况', async ({ page }) => {
    // 模拟错误场景
    await page.route('**/api/chat', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: '服务器错误' }),
      });
    });

    // 发送消息
    await chatPage.sendMessage('测试错误处理');

    // 等待错误提示
    const errorIndicator = await page.waitForSelector(
      '[data-testid="error-message"]',
      { timeout: 5000 }
    );

    // 验证错误信息显示
    const errorText = await errorIndicator.textContent();
    expect(errorText).toContain('错误');
  });

  test('应该能够处理网络中断', async ({ page, context }) => {
    // 发送消息
    await chatPage.sendMessage('测试网络中断');

    // 模拟网络中断
    await context.setOffline(true);

    // 等待离线提示
    await page.waitForSelector('[data-testid="offline-indicator"]', {
      timeout: 3000,
    });

    // 恢复网络
    await context.setOffline(false);

    // 等待重连提示
    await page.waitForSelector('[data-testid="reconnected-indicator"]', {
      timeout: 5000,
    });
  });

  test('应该能够展示思考过程', async ({ page }) => {
    // 发送复杂问题
    await chatPage.sendMessage('帮我分析这个复杂问题');

    // 等待思考块出现
    const thinkingBlock = await page.waitForSelector(
      '[data-testid="thinking-block"]',
      { timeout: 10000 }
    );

    // 验证思考内容
    const thinkingContent = await thinkingBlock.textContent();
    expect(thinkingContent?.length).toBeGreaterThan(0);

    // 验证可以展开/折叠
    await thinkingBlock.locator('[data-testid="toggle-thinking"]').click();
    await page.waitForSelector('[data-testid="thinking-block"][data-expanded="false"]');
  });

  test('应该能够展示执行计划', async ({ page }) => {
    // 发送需要规划的任务
    await chatPage.sendMessage('帮我完成一个多步骤任务');

    // 等待执行计划出现
    const planCard = await page.waitForSelector(
      '[data-testid="execution-plan"]',
      { timeout: 10000 }
    );

    // 验证计划步骤
    const steps = await planCard.$$eval('[data-testid="plan-step"]', elements =>
      elements.map(el => ({
        title: el.textContent,
        status: el.getAttribute('data-status'),
      }))
    );

    expect(steps.length).toBeGreaterThan(0);

    // 验证步骤状态变化
    for (const step of steps) {
      expect(step.status).toMatch(/pending|running|completed|failed/);
    }
  });

  test('应该能够处理多轮对话', async ({ page }) => {
    // 第一轮对话
    await chatPage.sendMessage('你好');
    await chatPage.waitForResponse();

    // 第二轮对话
    await chatPage.sendMessage('我想了解更多信息');
    await chatPage.waitForResponse();

    // 第三轮对话
    await chatPage.sendMessage('谢谢');
    await chatPage.waitForResponse();

    // 验证消息数量
    const messages = await chatPage.getMessages();
    expect(messages.length).toBeGreaterThanOrEqual(6); // 3轮对话，每轮2条消息

    // 验证上下文保持
    const lastMessage = messages[messages.length - 1];
    expect(lastMessage.role).toBe('assistant');
    expect(lastMessage.content).toBeTruthy();
  });

  test('应该能够展示性能指标', async ({ page }) => {
    // 发送消息
    await chatPage.sendMessage('测试性能指标');

    // 等待响应完成
    await chatPage.waitForResponse();

    // 等待性能指标出现
    const performanceMetrics = await page.waitForSelector(
      '[data-testid="performance-metrics"]',
      { timeout: 5000 }
    );

    // 验证指标内容
    const metrics = await performanceMetrics.$$eval('[data-testid="metric-item"]', elements =>
      elements.map(el => ({
        name: el.getAttribute('data-name'),
        value: el.textContent,
      }))
    );

    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics.find(m => m.name === 'response-time')).toBeTruthy();
  });
});