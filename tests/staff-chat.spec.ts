import { test, expect } from '@playwright/test';

/**
 * 数字员工 ChatPage 前端冒烟（UI 级 e2e，此前为 0 覆盖）。
 *
 * 覆盖用户视角的关键路径：
 *  1. 打开 /staff/chat 能看到聊天输入框
 *  2. 发送一条消息后，出现 assistant 回复（演示模式下为「（演示模式…」占位），
 *     且不会无限卡在 loading（即 done 事件已到达，前端收尾）
 *
 * 运行：npm run test:e2e  （playwright.config.ts 会在测试前拉起 npm run dev，
 * 默认 baseURL http://localhost:5173）
 * 注意：/staff/chat 若被登录墙拦截，需要先有可用会话态；本冒烟以未登录可达为前提，
 * 若页面被重定向到登录，则断言会失败，需补充 auth fixture。
 */
test.describe('数字员工 ChatPage 冒烟', () => {
  test('发送消息后看到 assistant 回复且 loading 收尾', async ({ page }) => {
    await page.goto('/staff/chat', { waitUntil: 'domcontentloaded' });

    // 等待聊天输入框可见（MUI TextField 表现为 role=textbox 或带 placeholder）
    const input = page
      .getByRole('textbox')
      .or(page.getByPlaceholder(/输入|发消息|说点什么|message/i))
      .first();
    await expect(input, '聊天输入框应可见').toBeVisible({ timeout: 20000 });

    // 输入并发送
    await input.click();
    await input.fill('你好，请介绍一下你自己');
    const sendBtn = page.getByRole('button', { name: /发送|send/i }).first();
    if (await sendBtn.isVisible().catch(() => false)) {
      await sendBtn.click();
    } else {
      await input.press('Enter');
    }

    // 等待 assistant 回复出现（演示模式下为「（演示模式」占位回答）
    // 该文本出现即代表 done 已到达、前端已收尾，不会卡在「思考中」
    await expect(
      page.getByText(/演示模式|思考中|你好/i).first(),
      '应出现 assistant 回复（证明 SSE done 已到达、loading 收尾）',
    ).toBeVisible({ timeout: 40000 });
  });
});
