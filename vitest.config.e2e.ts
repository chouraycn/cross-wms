import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest E2E 测试配置
 * 用于 API 测试、后端集成测试
 */
export default defineConfig({
  test: {
    // 测试环境
    globals: true,
    environment: 'node',

    // 测试匹配模式
    include: ['e2e/api/**/*.test.ts'],

    // 超时设置
    testTimeout: 30000,
    hookTimeout: 10000,

    // 并行执行
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4,
      },
    },

    // 重试配置
    retry: process.env.CI ? 2 : 0,

    // 报告器
    reporters: ['default', 'json'],
    outputFile: {
      json: 'e2e-results/api-results.json',
    },

    // 覆盖率配置
    coverage: {
      enabled: false, // E2E 测试不统计覆盖率
    },

    // 全局设置文件
    setupFiles: ['./e2e/helpers/testSetup.ts'],

    // 环境变量
    env: {
      NODE_ENV: 'test',
      E2E_TEST: 'true',
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@server': path.resolve(__dirname, './server'),
    },
  },
});