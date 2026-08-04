/**
 * 聊天页面 E2E 冒烟测试
 *
 * 说明：完整 AI 对话流程依赖真实模型调用、流式 SSE、工具执行等，
 * 在无密钥的 E2E 环境中不可靠。本测试聚焦页面加载与输入框可用性，
 * 以及关键 API 契约。深度交互测试应由 API E2E（e2e/api/*）覆盖。
 */

import { test, expect } from '../helpers/fixtures';

test.describe('聊天页面加载与输入', () => {
  test('应该能够加载 /chat 页面', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });

  test('应该显示聊天输入框', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // 实际存在的 data-testid
    const input = await page.waitForSelector('[data-testid="chat-input"]', {
      timeout: 10000,
    });
    expect(input).toBeTruthy();
  });

  test('应该显示发送按钮', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const sendButton = await page.waitForSelector('[data-testid="send-button"]', {
      timeout: 10000,
    });
    expect(sendButton).toBeTruthy();
  });

  test('应该能够在输入框中填写文字', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const input = await page.waitForSelector('[data-testid="chat-input"]', {
      timeout: 10000,
    });
    await input.fill('E2E 冒烟测试输入');
    // chat-input 是 contenteditable div，用 innerText 读取
    const value = await input.innerText();
    expect(value).toContain('E2E 冒烟测试输入');
  });
});
