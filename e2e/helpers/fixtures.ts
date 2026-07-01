/**
 * Playwright 测试 Fixtures
 * 提供可复用的测试上下文和辅助函数
 */

import { test as base, Page, BrowserContext } from '@playwright/test';

/**
 * 测试页面上下文
 */
interface TestPageContext {
  page: Page;
  context: BrowserContext;
}

/**
 * 扩展的测试 Fixtures
 */
export const test = base.extend<{
  // 已登录的页面
  loggedInPage: Page;

  // 测试数据
  testUser: { id: string; name: string; email: string };
  testSession: { id: string; createdAt: number };

  // 辅助函数
  waitForResponse: (url: string, timeout?: number) => Promise<void>;
  takeScreenshot: (name: string) => Promise<void>;
}>({
  // 已登录的页面 Fixture
  loggedInPage: async ({ page, context }, use) => {
    // 模拟登录状态
    await context.addCookies([
      {
        name: 'session',
        value: 'test-session-token',
        domain: 'localhost',
        path: '/',
      },
    ]);

    // 设置本地存储
    await page.addInitScript(() => {
      localStorage.setItem('user', JSON.stringify({
        id: 'test-user-1',
        name: '测试用户',
        email: 'test@example.com',
      }));
    });

    await use(page);
  },

  // 测试用户
  testUser: {
    id: 'test-user-1',
    name: '测试用户',
    email: 'test@example.com',
  },

  // 测试会话
  testSession: {
    id: 'test-session-1',
    createdAt: Date.now(),
  },

  // 等待响应辅助函数
  waitForResponse: async ({ page }, use) => {
    await use(async (url: string, timeout = 10000) => {
      await page.waitForResponse(
        response => response.url().includes(url),
        { timeout }
      );
    });
  },

  // 截图辅助函数
  takeScreenshot: async ({ page }, use) => {
    await use(async (name: string) => {
      await page.screenshot({
        path: `e2e-results/screenshots/${name}.png`,
        fullPage: true,
      });
    });
  },
});

/**
 * 页面对象模型 - 聊天页面
 */
export class ChatPage {
  constructor(private page: Page) {}

  // 选择器
  private selectors = {
    messageInput: '[data-testid="chat-input"]',
    sendButton: '[data-testid="send-button"]',
    messageList: '[data-testid="message-list"]',
    messageBubble: '[data-testid="message-bubble"]',
    toolCard: '[data-testid="tool-card"]',
    approvalDialog: '[data-testid="approval-dialog"]',
  };

  /**
   * 导航到聊天页面
   */
  async goto() {
    await this.page.goto('/chat');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 发送消息
   */
  async sendMessage(message: string) {
    await this.page.fill(this.selectors.messageInput, message);
    await this.page.click(this.selectors.sendButton);
  }

  /**
   * 等待 AI 响应
   */
  async waitForResponse(timeout = 10000) {
    await this.page.waitForSelector(
      `${this.selectors.messageBubble}:last-child[data-role="assistant"]`,
      { timeout }
    );
  }

  /**
   * 获取所有消息
   */
  async getMessages() {
    return this.page.$$eval(this.selectors.messageBubble, elements =>
      elements.map(el => ({
        role: el.getAttribute('data-role'),
        content: el.textContent,
      }))
    );
  }

  /**
   * 等待流式输出完成
   */
  async waitForStreamingComplete(timeout = 30000) {
    await this.page.waitForFunction(
      () => {
        const streamingIndicator = document.querySelector('[data-testid="streaming-indicator"]');
        return !streamingIndicator;
      },
      { timeout }
    );
  }

  /**
   * 处理审批对话框
   */
  async handleApproval(approve: boolean) {
    const dialog = await this.page.waitForSelector(
      this.selectors.approvalDialog,
      { timeout: 5000 }
    );

    const buttonSelector = approve
      ? '[data-testid="approve-button"]'
      : '[data-testid="reject-button"]';

    await dialog.click(buttonSelector);
  }
}

/**
 * 页面对象模型 - Wiki 页面
 */
export class WikiPage {
  constructor(private page: Page) {}

  private selectors = {
    wikiList: '[data-testid="wiki-list"]',
    wikiItem: '[data-testid="wiki-item"]',
    createButton: '[data-testid="create-wiki-button"]',
    editButton: '[data-testid="edit-wiki-button"]',
    deleteButton: '[data-testid="delete-wiki-button"]',
    searchInput: '[data-testid="wiki-search-input"]',
    titleInput: '[data-testid="wiki-title-input"]',
    contentInput: '[data-testid="wiki-content-input"]',
    tagsInput: '[data-testid="wiki-tags-input"]',
    saveButton: '[data-testid="wiki-save-button"]',
    tag: '[data-testid="wiki-tag"]',
  };

  /**
   * 导航到 Wiki 页面
   */
  async goto() {
    await this.page.goto('/wiki');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 创建 Wiki 条目
   */
  async createEntry(title: string, content: string, tags: string[] = []) {
    await this.page.click(this.selectors.createButton);
    await this.page.fill(this.selectors.titleInput, title);
    await this.page.fill(this.selectors.contentInput, content);

    if (tags.length > 0) {
      await this.page.fill(this.selectors.tagsInput, tags.join(','));
    }

    await this.page.click(this.selectors.saveButton);
  }

  /**
   * 编辑 Wiki 条目
   */
  async editEntry(index: number, title: string, content: string) {
    const items = await this.page.$$(this.selectors.wikiItem);
    const item = items[index];
    await item.click(this.selectors.editButton);

    await this.page.fill(this.selectors.titleInput, title);
    await this.page.fill(this.selectors.contentInput, content);
    await this.page.click(this.selectors.saveButton);
  }

  /**
   * 删除 Wiki 条目
   */
  async deleteEntry(index: number) {
    const items = await this.page.$$(this.selectors.wikiItem);
    const item = items[index];
    await item.click(this.selectors.deleteButton);

    // 确认删除
    await this.page.click('[data-testid="confirm-delete-button"]');
  }

  /**
   * 搜索 Wiki 条目
   */
  async search(query: string) {
    await this.page.fill(this.selectors.searchInput, query);
    await this.page.press(this.selectors.searchInput, 'Enter');
  }

  /**
   * 获取所有 Wiki 条目
   */
  async getEntries() {
    return this.page.$$eval(this.selectors.wikiItem, elements =>
      elements.map(el => ({
        title: el.querySelector('[data-testid="wiki-title"]')?.textContent,
        content: el.querySelector('[data-testid="wiki-content"]')?.textContent,
        tags: Array.from(el.querySelectorAll('[data-testid="wiki-tag"]')).map(
          tag => tag.textContent
        ),
      }))
    );
  }
}

/**
 * 页面对象模型 - 记忆页面
 */
export class MemoryPage {
  constructor(private page: Page) {}

  private selectors = {
    memoryList: '[data-testid="memory-list"]',
    memoryItem: '[data-testid="memory-item"]',
    addButton: '[data-testid="add-memory-button"]',
    deleteButton: '[data-testid="delete-memory-button"]',
    searchInput: '[data-testid="memory-search-input"]',
    contentInput: '[data-testid="memory-content-input"]',
    saveButton: '[data-testid="memory-save-button"]',
  };

  /**
   * 导航到记忆页面
   */
  async goto() {
    await this.page.goto('/memory');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 添加记忆
   */
  async addMemory(content: string) {
    await this.page.click(this.selectors.addButton);
    await this.page.fill(this.selectors.contentInput, content);
    await this.page.click(this.selectors.saveButton);
  }

  /**
   * 删除记忆
   */
  async deleteMemory(index: number) {
    const items = await this.page.$$(this.selectors.memoryItem);
    const item = items[index];
    await item.locator(this.selectors.deleteButton).click();
  }

  /**
   * 搜索记忆
   */
  async search(query: string) {
    await this.page.fill(this.selectors.searchInput, query);
    await this.page.press(this.selectors.searchInput, 'Enter');
  }

  /**
   * 获取所有记忆
   */
  async getMemories() {
    return this.page.$$eval(this.selectors.memoryItem, elements =>
      elements.map(el => ({
        content: el.querySelector('[data-testid="memory-content"]')?.textContent,
        type: el.getAttribute('data-type'),
      }))
    );
  }
}

/**
 * 页面对象模型 - 工具页面
 */
export class ToolsPage {
  constructor(private page: Page) {}

  private selectors = {
    toolList: '[data-testid="tool-list"]',
    toolItem: '[data-testid="tool-item"]',
    executeButton: '[data-testid="execute-tool-button"]',
    resultPanel: '[data-testid="tool-result-panel"]',
    lspStatus: '[data-testid="lsp-status"]',
    browserControl: '[data-testid="browser-control"]',
  };

  /**
   * 导航到工具页面
   */
  async goto() {
    await this.page.goto('/tools');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 执行工具
   */
  async executeTool(toolName: string, params: Record<string, unknown>) {
    const toolItem = await this.page.waitForSelector(
      `${this.selectors.toolItem}[data-tool="${toolName}"]`
    );
    await toolItem.locator(this.selectors.executeButton).click();

    // 填写参数
    for (const [key, value] of Object.entries(params)) {
      await this.page.fill(`[data-testid="param-${key}"]`, String(value));
    }

    await this.page.click('[data-testid="confirm-execute-button"]');
  }

  /**
   * 等待工具执行结果
   */
  async waitForResult(timeout = 10000) {
    await this.page.waitForSelector(this.selectors.resultPanel, { timeout });
    return this.page.textContent(this.selectors.resultPanel);
  }

  /**
   * 获取 LSP 状态
   */
  async getLSPStatus() {
    return this.page.textContent(this.selectors.lspStatus);
  }

  /**
   * 获取所有可用工具
   */
  async getAvailableTools() {
    return this.page.$$eval(this.selectors.toolItem, elements =>
      elements.map(el => ({
        name: el.getAttribute('data-tool'),
        status: el.getAttribute('data-status'),
      }))
    );
  }
}

// 导出 expect 用于断言
export { expect } from '@playwright/test';