/**
 * 工具调用 E2E 测试
 * 测试 PDF 工具、LSP 状态、浏览器控制、文件操作功能
 */

import { test, expect, ToolsPage } from '../helpers/fixtures';

test.describe('工具调用功能测试', () => {
  let toolsPage: ToolsPage;

  test.beforeEach(async ({ page }) => {
    toolsPage = new ToolsPage(page);
    await toolsPage.goto();
  });

  test.describe('PDF 工具测试', () => {
    test('应该能够列出可用的 PDF 工具', async ({ page }) => {
      // 等待工具列表加载
      await page.waitForSelector('[data-testid="tool-list"]', {
        timeout: 5000,
      });

      // 获取所有工具
      const tools = await toolsPage.getAvailableTools();
      const pdfTool = tools.find(t => t.name === 'pdf-reader');

      // 验证 PDF 工具存在且可用
      expect(pdfTool).toBeTruthy();
      expect(pdfTool?.status).toBe('available');
    });

    test('应该能够执行 PDF 读取工具', async ({ page }) => {
      // 执行 PDF 读取工具
      await toolsPage.executeTool('pdf-reader', {
        filePath: '/test/sample.pdf',
      });

      // 等待执行完成
      const result = await toolsPage.waitForResult();

      // 验证结果
      expect(result).toBeTruthy();
      expect(result).toContain('成功');
    });

    test('应该能够处理 PDF 文件不存在的情况', async ({ page }) => {
      // 执行工具读取不存在的文件
      await toolsPage.executeTool('pdf-reader', {
        filePath: '/test/nonexistent.pdf',
      });

      // 等待错误结果
      await page.waitForSelector('[data-testid="tool-error"]', {
        timeout: 5000,
      });

      // 验证错误信息
      const errorText = await page.textContent('[data-testid="tool-error"]');
      expect(errorText).toContain('不存在');
    });

    test('应该能够处理大型 PDF 文件', async ({ page }) => {
      // 执行工具读取大型文件
      await toolsPage.executeTool('pdf-reader', {
        filePath: '/test/large.pdf',
        options: {
          maxPages: 100,
        },
      });

      // 等待进度指示器
      await page.waitForSelector('[data-testid="progress-indicator"]', {
        timeout: 3000,
      });

      // 等待执行完成
      const result = await toolsPage.waitForResult(30000);

      // 验证结果包含分页信息
      expect(result).toContain('页');
    });

    test('应该能够提取 PDF 中的文本', async ({ page }) => {
      // 执行文本提取
      await toolsPage.executeTool('pdf-reader', {
        filePath: '/test/sample.pdf',
        action: 'extract-text',
      });

      // 等待结果
      const result = await toolsPage.waitForResult();

      // 验证提取的文本
      expect(result?.length).toBeGreaterThan(100);
    });

    test('应该能够提取 PDF 元数据', async ({ page }) => {
      // 执行元数据提取
      await toolsPage.executeTool('pdf-reader', {
        filePath: '/test/sample.pdf',
        action: 'extract-metadata',
      });

      // 等待结果
      const result = await toolsPage.waitForResult();

      // 验证元数据结构
      const metadataPanel = await page.waitForSelector('[data-testid="metadata-panel"]');
      expect(metadataPanel).toBeTruthy();

      const metadata = await metadataPanel.$$eval('[data-testid="metadata-item"]', items =>
        items.map(item => ({
          key: item.getAttribute('data-key'),
          value: item.textContent,
        }))
      );

      expect(metadata.find(m => m.key === 'title')).toBeTruthy();
      expect(metadata.find(m => m.key === 'author')).toBeTruthy();
    });
  });

  test.describe('LSP 状态测试', () => {
    test('应该能够显示 LSP 连接状态', async ({ page }) => {
      // 等待 LSP 状态显示
      await page.waitForSelector('[data-testid="lsp-status"]', {
        timeout: 5000,
      });

      // 获取 LSP 状态
      const lspStatus = await toolsPage.getLSPStatus();

      // 验证状态
      expect(lspStatus).toMatch(/connected|disconnected|error/);
    });

    test('应该能够连接到 LSP 服务器', async ({ page }) => {
      // 如果当前是断开状态，点击连接按钮
      const status = await toolsPage.getLSPStatus();
      if (status === 'disconnected') {
        await page.click('[data-testid="connect-lsp-button"]');
      }

      // 等待连接成功
      await page.waitForSelector('[data-testid="lsp-status"][data-status="connected"]', {
        timeout: 10000,
      });

      // 验证连接状态
      const connectedStatus = await toolsPage.getLSPStatus();
      expect(connectedStatus).toBe('connected');
    });

    test('应该能够显示 LSP 服务器信息', async ({ page }) => {
      // 等待连接成功
      await page.waitForSelector('[data-testid="lsp-status"][data-status="connected"]', {
        timeout: 5000,
      });

      // 点击查看详情按钮
      await page.click('[data-testid="lsp-info-button"]');

      // 等待详情面板
      const infoPanel = await page.waitForSelector('[data-testid="lsp-info-panel"]', {
        timeout: 5000,
      });

      // 验证服务器信息
      const serverInfo = await infoPanel.$$eval('[data-testid="info-item"]', items =>
        items.map(item => ({
          key: item.getAttribute('data-key'),
          value: item.textContent,
        }))
      );

      expect(serverInfo.find(i => i.key === 'server-name')).toBeTruthy();
      expect(serverInfo.find(i => i.key === 'version')).toBeTruthy();
    });

    test('应该能够处理 LSP 连接失败', async ({ page }) => {
      // 模拟连接失败
      await page.route('**/api/lsp/connect', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: '连接失败' }),
        });
      });

      // 点击连接按钮
      await page.click('[data-testid="connect-lsp-button"]');

      // 等待错误提示
      await page.waitForSelector('[data-testid="lsp-error"]', {
        timeout: 5000,
      });

      // 验证错误信息
      const errorText = await page.textContent('[data-testid="lsp-error"]');
      expect(errorText).toContain('失败');
    });

    test('应该能够重启 LSP 服务器', async ({ page }) => {
      // 等待连接成功
      await page.waitForSelector('[data-testid="lsp-status"][data-status="connected"]', {
        timeout: 5000,
      });

      // 点击重启按钮
      await page.click('[data-testid="restart-lsp-button"]');

      // 等待重启过程
      await page.waitForSelector('[data-testid="lsp-status"][data-status="restarting"]', {
        timeout: 3000,
      });

      // 等待重启完成
      await page.waitForSelector('[data-testid="lsp-status"][data-status="connected"]', {
        timeout: 10000,
      });

      // 验证重启成功
      const status = await toolsPage.getLSPStatus();
      expect(status).toBe('connected');
    });
  });

  test.describe('浏览器控制测试', () => {
    test('应该能够打开浏览器控制面板', async ({ page }) => {
      // 点击浏览器控制按钮
      await page.click('[data-testid="browser-control-button"]');

      // 等待控制面板打开
      const controlPanel = await page.waitForSelector('[data-testid="browser-control-panel"]', {
        timeout: 5000,
      });

      // 验证控制面板元素
      expect(controlPanel).toBeTruthy();

      // 验证控制按钮
      const buttons = await controlPanel.$$eval('[data-testid="control-button"]', buttons =>
        buttons.map(btn => btn.getAttribute('data-action'))
      );

      expect(buttons).toContain('navigate');
      expect(buttons).toContain('click');
      expect(buttons).toContain('input');
      expect(buttons).toContain('scroll');
    });

    test('应该能够执行浏览器导航', async ({ page }) => {
      // 打开浏览器控制
      await page.click('[data-testid="browser-control-button"]');
      await page.waitForSelector('[data-testid="browser-control-panel"]');

      // 输入 URL
      await page.fill('[data-testid="browser-url-input"]', 'https://example.com');

      // 点击导航按钮
      await page.click('[data-testid="control-button"][data-action="navigate"]');

      // 等待导航完成
      await page.waitForSelector('[data-testid="browser-preview"]', {
        timeout: 10000,
      });

      // 验证预览内容
      const preview = await page.waitForSelector('[data-testid="browser-preview"]');
      expect(preview).toBeTruthy();
    });

    test('应该能够执行点击操作', async ({ page }) => {
      // 打开浏览器控制
      await page.click('[data-testid="browser-control-button"]');
      await page.waitForSelector('[data-testid="browser-control-panel"]');

      // 先导航到测试页面
      await page.fill('[data-testid="browser-url-input"]', 'https://example.com');
      await page.click('[data-testid="control-button"][data-action="navigate"]');
      await page.waitForSelector('[data-testid="browser-preview"]');

      // 执行点击操作
      await page.click('[data-testid="control-button"][data-action="click"]');
      await page.fill('[data-testid="click-selector-input"]', 'a[href]');

      // 等待点击执行
      await page.waitForSelector('[data-testid="action-result"]', {
        timeout: 5000,
      });

      // 验证点击结果
      const resultText = await page.textContent('[data-testid="action-result"]');
      expect(resultText).toContain('成功');
    });

    test('应该能够执行输入操作', async ({ page }) => {
      // 打开浏览器控制
      await page.click('[data-testid="browser-control-button"]');
      await page.waitForSelector('[data-testid="browser-control-panel"]');

      // 导航到测试页面
      await page.fill('[data-testid="browser-url-input"]', 'https://example.com');
      await page.click('[data-testid="control-button"][data-action="navigate"]');
      await page.waitForSelector('[data-testid="browser-preview"]');

      // 执行输入操作
      await page.click('[data-testid="control-button"][data-action="input"]');
      await page.fill('[data-testid="input-selector-input"]', 'input[type="text"]');
      await page.fill('[data-testid="input-value-input"]', '测试文本');

      // 等待输入执行
      await page.waitForSelector('[data-testid="action-result"]', {
        timeout: 5000,
      });

      // 验证输入结果
      const resultText = await page.textContent('[data-testid="action-result"]');
      expect(resultText).toContain('成功');
    });

    test('应该能够截图', async ({ page }) => {
      // 打开浏览器控制
      await page.click('[data-testid="browser-control-button"]');
      await page.waitForSelector('[data-testid="browser-control-panel"]');

      // 导航到测试页面
      await page.fill('[data-testid="browser-url-input"]', 'https://example.com');
      await page.click('[data-testid="control-button"][data-action="navigate"]');
      await page.waitForSelector('[data-testid="browser-preview"]');

      // 点击截图按钮
      await page.click('[data-testid="control-button"][data-action="screenshot"]');

      // 等待截图完成
      await page.waitForSelector('[data-testid="screenshot-result"]', {
        timeout: 5000,
      });

      // 验证截图显示
      const screenshot = await page.waitForSelector('[data-testid="screenshot-image"]');
      expect(screenshot).toBeTruthy();
    });

    test('应该能够关闭浏览器', async ({ page }) => {
      // 打开浏览器控制
      await page.click('[data-testid="browser-control-button"]');
      await page.waitForSelector('[data-testid="browser-control-panel"]');

      // 点击关闭按钮
      await page.click('[data-testid="close-browser-button"]');

      // 等待浏览器关闭
      await page.waitForSelector('[data-testid="browser-control-panel"]', {
        state: 'hidden',
        timeout: 5000,
      });

      // 验证状态更新
      const status = await page.textContent('[data-testid="browser-status"]');
      expect(status).toContain('已关闭');
    });
  });

  test.describe('文件操作测试', () => {
    test('应该能够列出文件操作工具', async ({ page }) => {
      // 等待工具列表
      await page.waitForSelector('[data-testid="tool-list"]');

      // 获取文件操作工具
      const tools = await toolsPage.getAvailableTools();
      const fileTools = tools.filter(t =>
        t.name?.startsWith('file-') || t.name?.includes('fs')
      );

      // 验证文件工具存在
      expect(fileTools.length).toBeGreaterThan(0);
    });

    test('应该能够读取文件', async ({ page }) => {
      // 执行文件读取
      await toolsPage.executeTool('file-read', {
        path: '/test/sample.txt',
      });

      // 等待结果
      const result = await toolsPage.waitForResult();

      // 验证读取结果
      expect(result).toBeTruthy();
      expect(result?.length).toBeGreaterThan(0);
    });

    test('应该能够写入文件', async ({ page }) => {
      // 执行文件写入
      await toolsPage.executeTool('file-write', {
        path: '/test/output.txt',
        content: '这是测试写入的内容',
      });

      // 等待结果
      await page.waitForSelector('[data-testid="tool-success"]', {
        timeout: 5000,
      });

      // 验证写入成功
      const successText = await page.textContent('[data-testid="tool-success"]');
      expect(successText).toContain('成功');
    });

    test('应该能够创建目录', async ({ page }) => {
      // 执行创建目录
      await toolsPage.executeTool('file-mkdir', {
        path: '/test/new-directory',
      });

      // 等待结果
      await page.waitForSelector('[data-testid="tool-success"]', {
        timeout: 5000,
      });

      // 验证创建成功
      const successText = await page.textContent('[data-testid="tool-success"]');
      expect(successText).toContain('成功');
    });

    test('应该能够删除文件', async ({ page }) => {
      // 先创建一个待删除的文件
      await toolsPage.executeTool('file-write', {
        path: '/test/to-delete.txt',
        content: '临时文件',
      });
      await page.waitForTimeout(1000);

      // 执行删除
      await toolsPage.executeTool('file-delete', {
        path: '/test/to-delete.txt',
      });

      // 等待结果
      await page.waitForSelector('[data-testid="tool-success"]', {
        timeout: 5000,
      });

      // 验证删除成功
      const successText = await page.textContent('[data-testid="tool-success"]');
      expect(successText).toContain('成功');
    });

    test('应该能够列出目录内容', async ({ page }) => {
      // 执行列出目录
      await toolsPage.executeTool('file-list', {
        path: '/test',
      });

      // 等待结果
      await page.waitForSelector('[data-testid="file-list-result"]', {
        timeout: 5000,
      });

      // 验证列表内容
      const fileList = await page.$$eval('[data-testid="file-item"]', items =>
        items.map(item => ({
          name: item.textContent,
          type: item.getAttribute('data-type'),
        }))
      );

      expect(fileList.length).toBeGreaterThan(0);
      expect(fileList.find(f => f.type === 'file')).toBeTruthy();
      expect(fileList.find(f => f.type === 'directory')).toBeTruthy();
    });

    test('应该能够搜索文件', async ({ page }) => {
      // 执行文件搜索
      await toolsPage.executeTool('file-search', {
        path: '/test',
        pattern: '*.txt',
      });

      // 等待结果
      await page.waitForSelector('[data-testid="file-search-result"]', {
        timeout: 5000,
      });

      // 验证搜索结果
      const searchResults = await page.$$eval('[data-testid="file-item"]', items =>
        items.map(item => item.textContent)
      );

      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults.every(name => name?.endsWith('.txt'))).toBeTruthy();
    });

    test('应该能够复制文件', async ({ page }) => {
      // 执行文件复制
      await toolsPage.executeTool('file-copy', {
        source: '/test/sample.txt',
        destination: '/test/sample-copy.txt',
      });

      // 等待结果
      await page.waitForSelector('[data-testid="tool-success"]', {
        timeout: 5000,
      });

      // 验证复制成功
      const successText = await page.textContent('[data-testid="tool-success"]');
      expect(successText).toContain('成功');
    });

    test('应该能够移动文件', async ({ page }) => {
      // 执行文件移动
      await toolsPage.executeTool('file-move', {
        source: '/test/sample.txt',
        destination: '/test/moved-sample.txt',
      });

      // 等待结果
      await page.waitForSelector('[data-testid="tool-success"]', {
        timeout: 5000,
      });

      // 验证移动成功
      const successText = await page.textContent('[data-testid="tool-success"]');
      expect(successText).toContain('成功');
    });
  });

  test.describe('工具审批测试', () => {
    test('应该能够请求工具执行审批', async ({ page }) => {
      // 执行需要审批的工具
      await toolsPage.executeTool('file-delete', {
        path: '/important/file.txt',
      });

      // 等待审批对话框
      const approvalDialog = await page.waitForSelector('[data-testid="approval-dialog"]', {
        timeout: 5000,
      });

      // 验证审批信息
      expect(approvalDialog).toBeTruthy();

      const approvalMessage = await approvalDialog.$eval(
        '[data-testid="approval-message"]',
        el => el.textContent
      );
      expect(approvalMessage).toContain('删除');
    });

    test('应该能够同意工具执行', async ({ page }) => {
      // 执行需要审批的工具
      await toolsPage.executeTool('file-delete', {
        path: '/test/to-delete.txt',
      });

      // 等待审批对话框
      await page.waitForSelector('[data-testid="approval-dialog"]');

      // 点击同意按钮
      await page.click('[data-testid="approve-button"]');

      // 等待执行完成
      await page.waitForSelector('[data-testid="tool-success"]', {
        timeout: 10000,
      });

      // 验证执行成功
      const successText = await page.textContent('[data-testid="tool-success"]');
      expect(successText).toContain('成功');
    });

    test('应该能够拒绝工具执行', async ({ page }) => {
      // 执行需要审批的工具
      await toolsPage.executeTool('file-delete', {
        path: '/test/file.txt',
      });

      // 等待审批对话框
      await page.waitForSelector('[data-testid="approval-dialog"]');

      // 点击拒绝按钮
      await page.click('[data-testid="reject-button"]');

      // 等待对话框关闭
      await page.waitForSelector('[data-testid="approval-dialog"]', {
        state: 'hidden',
        timeout: 3000,
      });

      // 验证执行未发生
      const toolStatus = await page.getAttribute('[data-testid="tool-item"]', 'data-status');
      expect(toolStatus).toBe('rejected');
    });
  });

  test.describe('工具性能测试', () => {
    test('应该能够显示工具执行时间', async ({ page }) => {
      // 执行工具
      await toolsPage.executeTool('pdf-reader', {
        filePath: '/test/sample.pdf',
      });

      // 等待结果
      await toolsPage.waitForResult();

      // 等待性能指标显示
      const performanceMetrics = await page.waitForSelector('[data-testid="tool-performance"]', {
        timeout: 5000,
      });

      // 验证执行时间
      const executionTime = await performanceMetrics.$eval(
        '[data-testid="execution-time"]',
        el => el.textContent
      );
      expect(executionTime).toBeTruthy();
      expect(executionTime).toContain('ms');
    });

    test('应该能够显示工具资源消耗', async ({ page }) => {
      // 执行大型文件处理
      await toolsPage.executeTool('pdf-reader', {
        filePath: '/test/large.pdf',
      });

      // 等待结果
      await toolsPage.waitForResult(30000);

      // 等待资源消耗显示
      const resourceMetrics = await page.waitForSelector('[data-testid="tool-resources"]', {
        timeout: 5000,
      });

      // 验证内存使用
      const memoryUsage = await resourceMetrics.$eval(
        '[data-testid="memory-usage"]',
        el => el.textContent
      );
      expect(memoryUsage).toBeTruthy();
    });

    test('应该能够处理工具超时', async ({ page }) => {
      // 设置超时时间
      await page.fill('[data-testid="timeout-input"]', '1000'); // 1秒

      // 执行耗时操作
      await toolsPage.executeTool('pdf-reader', {
        filePath: '/test/very-large.pdf',
      });

      // 等待超时提示
      await page.waitForSelector('[data-testid="tool-timeout"]', {
        timeout: 5000,
      });

      // 验证超时信息
      const timeoutText = await page.textContent('[data-testid="tool-timeout"]');
      expect(timeoutText).toContain('超时');
    });
  });
});