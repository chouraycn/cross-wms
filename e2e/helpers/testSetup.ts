/**
 * E2E 测试环境设置
 * 用于 Vitest API 测试和 Playwright 测试的全局配置
 */

import { beforeAll, afterAll, afterEach } from 'vitest';

// 测试环境变量
process.env.NODE_ENV = 'test';
process.env.E2E_TEST = 'true';

// 全局超时设置
beforeAll(async () => {
  console.log('🚀 E2E 测试环境启动');
  // 可以在这里添加全局初始化逻辑
  // 例如：数据库连接、服务器启动等
}, 30000);

afterAll(async () => {
  console.log('✅ E2E 测试环境清理');
  // 清理资源
});

afterEach(async () => {
  // 每个测试后的清理
});

// 全局错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
  // 在测试中不退出进程，允许测试继续运行
});

// 导出测试配置
export const testConfig = {
  baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
  apiBaseURL: process.env.E2E_API_URL || 'http://localhost:3000',
  timeout: 30000,
  retryCount: process.env.CI ? 2 : 0,
};

/**
 * 等待辅助函数
 */
export async function waitFor(
  condition: () => Promise<boolean> | boolean,
  timeout = 10000,
  interval = 500
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`等待超时 (${timeout}ms)`);
}

/**
 * 延迟辅助函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}