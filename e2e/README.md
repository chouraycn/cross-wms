# E2E 测试框架指南

## 📋 概述

本项目的端到端（E2E）测试框架基于 **Vitest + Playwright** 构建，用于验证关键用户路径、前后端交互、UI 响应和错误处理。

## 🏗️ 框架结构

```
e2e/
├── playwright.config.ts          # Playwright 配置文件
├── helpers/
│   ├── testSetup.ts              # 测试环境设置
│   ├── mockServer.ts             # Mock API 服务器
│   └── fixtures.ts               # 测试 fixtures 和页面对象模型
├── tests/
│   ├── chat.spec.ts              # 聊天场景测试
│   ├── wiki.spec.ts              # Wiki 知识库测试
│   ├── memory.spec.ts            # 记忆系统测试
│   └── tools.spec.ts             # 工具调用测试
├── quality-gate.json             # 质量门禁配置
└── README.md                     # 本文档
```

## 🚀 快速开始

### 安装依赖

```bash
# 安装项目依赖（包含 Playwright）
npm install

# 安装 Playwright 浏览器
npx playwright install
```

### 运行测试

```bash
# 运行所有 E2E 测试
npm run test:e2e

# 运行 API E2E 测试
npm run test:e2e:api

# 运行 UI 测试（Playwright）
npm run test:e2e:ui

# 调试模式
npm run test:e2e:debug

# 查看测试报告
npm run test:e2e:report
```

### 运行特定测试

```bash
# 运行特定测试文件
npx playwright test e2e/tests/chat.spec.ts --config=e2e/playwright.config.ts

# 运行特定测试用例
npx playwright test --grep "应该能够发送消息"

# 运行烟雾测试
npx playwright test --grep "@smoke"
```

## 📝 测试场景

### 1. 聊天功能测试 (`chat.spec.ts`)

- ✅ 发送消息并接收回复
- ✅ 流式输出展示
- ✅ 工具调用展示
- ✅ 审批流程（同意/拒绝）
- ✅ 错误处理
- ✅ 网络中断处理
- ✅ 思考过程展示
- ✅ 执行计划展示
- ✅ 多轮对话
- ✅ 性能指标展示

### 2. Wiki 知识库测试 (`wiki.spec.ts`)

- ✅ 创建/编辑/删除条目
- ✅ 搜索功能
- ✅ 标签管理
- ✅ 批量操作
- ✅ 条目详情展示
- ✅ 导出功能
- ✅ 并发编辑冲突处理

### 3. 记忆系统测试 (`memory.spec.ts`)

- ✅ 添加/删除记忆
- ✅ 搜索记忆
- ✅ 类型筛选
- ✅ 同步操作
- ✅ 重要性设置
- ✅ 导入/导出
- ✅ 重复检测

### 4. 工具调用测试 (`tools.spec.ts`)

- ✅ PDF 工具（读取、提取、元数据）
- ✅ LSP 状态（连接、重启、信息）
- ✅ 浏览器控制（导航、点击、输入、截图）
- ✅ 文件操作（读、写、删除、搜索）
- ✅ 工具审批流程
- ✅ 性能监控

## 🔧 配置说明

### Playwright 配置 (`playwright.config.ts`)

```typescript
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

### Vitest E2E 配置 (`vitest.config.e2e.ts`)

```typescript
export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/api/**/*.test.ts'],
    testTimeout: 30000,
    retry: process.env.CI ? 2 : 0,
  },
});
```

### 质量门禁配置 (`quality-gate.json`)

定义了测试覆盖率、性能、可用性阈值：

- **覆盖率**: 全局 ≥70%，关键路径 100%
- **性能**: 页面加载 ≤3s，API ≤1s
- **成功率**: ≥95%

## 🎯 测试最佳实践

### 1. 页面对象模型 (POM)

使用 fixtures.ts 中定义的页面对象：

```typescript
import { test, expect, ChatPage } from '../helpers/fixtures';

test('聊天测试', async ({ page }) => {
  const chatPage = new ChatPage(page);
  await chatPage.goto();
  await chatPage.sendMessage('测试消息');
  await chatPage.waitForResponse();
});
```

### 2. 数据-testid 属性

为测试元素添加 `data-testid` 属性：

```tsx
<button data-testid="send-button">发送</button>
<input data-testid="chat-input" />
<div data-testid="message-bubble" data-role="assistant">
  {content}
</div>
```

### 3. Mock API

使用 mockServer.ts 模拟 API 响应：

```typescript
import { startMockServer, stopMockServer } from '../helpers/mockServer';

beforeAll(() => startMockServer());
afterAll(() => stopMockServer());
```

### 4. 等待策略

避免使用固定等待时间，使用智能等待：

```typescript
// ❌ 不推荐
await page.waitForTimeout(1000);

// ✅ 推荐
await page.waitForSelector('[data-testid="element"]');
await page.waitForLoadState('networkidle');
await expect(page.locator('[data-testid="element"]')).toBeVisible();
```

### 5. 测试隔离

确保测试之间相互独立：

```typescript
test.beforeEach(async ({ page }) => {
  // 每个测试前清理状态
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});
```

## 🔍 测试报告

### HTML 报告

测试完成后生成 HTML 报告：

```bash
npm run test:e2e:report
```

报告位置：`e2e-report/index.html`

### JSON 报告

测试结果以 JSON 格式保存：

- UI 测试：`e2e-results/results.json`
- API 测试：`e2e-results/api-results.json`

### 截图和视频

失败测试的截图和视频自动保存：

- 截图：`e2e-results/screenshots/`
- 视频：`test-results/`

## 🚦 CI/CD 集成

### GitHub Actions 工作流

测试在以下情况自动运行：

- ✅ Push 到 main/master/develop 分支
- ✅ Pull Request
- ✅ 每日凌晨 2 点定时执行
- ✅ 手动触发

工作流配置：`.github/workflows/e2e-test.yml`

### 质量门禁

测试必须满足以下条件才能通过：

- ✅ 成功率 ≥95%
- ✅ 关键路径 100% 通过
- ✅ 性能在阈值内
- ✅ 错误处理完整

### 失败通知

测试失败时自动通知：

- Slack Webhook
- Email 通知

## 🐛 常见问题

### 1. 浏览器启动失败

```bash
# 安装浏览器依赖
npx playwright install-deps

# 或使用系统包管理器
sudo apt-get install libwoff1 libopus0 libwebp6 libwebpdemux2 libenchant-2-2 libgudev-1.0-0 libsecret-1-dev libhyphen0 libgdk-pixbuf2.0-0 libegl1 libgles2 libevent-2-7-0
```

### 2. 测试超时

调整超时设置：

```typescript
test('测试', async ({ page }) => {
  test.setTimeout(60000); // 单个测试 60 秒
});
```

### 3. 元素查找失败

使用更精确的选择器：

```typescript
// ❌ 不推荐
await page.locator('.button').click();

// ✅ 推荐
await page.locator('[data-testid="send-button"]').click();
await page.getByRole('button', { name: '发送' }).click();
```

### 4. 状态污染

确保测试隔离：

```typescript
test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});
```

## 📊 性能基准

### 预期性能指标

| 指标 | 阈值 | 目标 |
|------|------|------|
| 页面加载 | ≤3s | 1.5s |
| API 响应 | ≤1s | 500ms |
| 流式输出延迟 | ≤100ms | 50ms |
| 测试成功率 | ≥95% | 100% |

### 性能测试示例

```typescript
test('性能测试', async ({ page }) => {
  const startTime = Date.now();
  await page.goto('/');
  const loadTime = Date.now() - startTime;

  expect(loadTime).toBeLessThan(3000);
});
```

## 🔒 安全考虑

### 1. 测试数据隔离

- 使用独立的测试数据库
- 测试结束后清理数据
- 不使用生产环境数据

### 2. Mock 数据安全

- 不在 Mock 中暴露真实密钥
- 使用测试专用的 API Token
- 隔离敏感操作

### 3. 测试环境安全

- 使用独立的测试环境
- 配置 CORS 和 CSP
- 启用 HTTPS（如需要）

## 📈 扩展测试

### 1. 添加新测试文件

```typescript
// e2e/tests/new-feature.spec.ts
import { test, expect } from '../helpers/fixtures';

test.describe('新功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/new-feature');
  });

  test('应该能够使用新功能', async ({ page }) => {
    // 测试代码
  });
});
```

### 2. 添加页面对象

```typescript
// e2e/helpers/fixtures.ts
export class NewFeaturePage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/new-feature');
  }

  async performAction() {
    await this.page.click('[data-testid="action-button"]');
  }
}
```

### 3. 添加 Mock Handler

```typescript
// e2e/helpers/mockServer.ts
const handlers = [
  http.post('/api/new-feature', async () => {
    return HttpResponse.json({ success: true });
  }),
];
```

## 📚 参考资料

- [Playwright 官方文档](https://playwright.dev/)
- [Vitest 官方文档](https://vitest.dev/)
- [Testing Library 文档](https://testing-library.com/)
- [MSW 文档](https://mswjs.io/)

## 🤝 贡献指南

### 测试代码规范

1. 使用 TypeScript
2. 使用中文测试描述
3. 使用页面对象模型
4. 添加适当的等待
5. 确保测试隔离
6. 处理所有错误情况

### 提交测试代码

1. 确保所有测试通过
2. 更新相关文档
3. 添加测试说明
4. 通过代码审查

## 📞 联系方式

如有问题或建议，请联系：

- 项目负责人
- 测试团队
- GitHub Issues

---

**版本**: 1.0.0
**最后更新**: 2026-07-01