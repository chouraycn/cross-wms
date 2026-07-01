import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 测试配置
 * 用于 UI 交互测试、用户场景验证
 */
export default defineConfig({
  // 测试目录
  testDir: './tests',

  // 测试匹配模式
  testMatch: '**/*.spec.ts',

  // 全局设置
  fullyParallel: false, // E2E 测试需要串行执行以避免状态冲突
  forbidOnly: !!process.env.CI, // CI 环境禁止使用 .only
  retries: process.env.CI ? 2 : 0, // CI 环境重试 2 次
  workers: 1, // 单进程执行，避免并发问题

  // 超时设置
  timeout: 30000, // 单个测试 30 秒超时
  expect: {
    timeout: 10000, // 断言 10 秒超时
  },

  // 报告器
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e-report', open: 'never' }],
    ['json', { outputFile: 'e2e-results/results.json' }],
  ],

  // 全局配置
  use: {
    // 基础 URL
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',

    // 跟踪配置
    trace: 'retain-on-failure', // 失败时保留跟踪

    // 截图配置
    screenshot: 'only-on-failure', // 失败时截图

    // 视频录制
    video: 'retain-on-failure', // 失败时保留视频

    // 浏览器上下文配置
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,

    // 操作超时
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },

  // 项目配置
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // 可选：启用其他浏览器
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // 测试前启动开发服务器
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
});