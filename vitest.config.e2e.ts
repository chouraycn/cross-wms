import { defineConfig } from 'vitest/config';
import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Vitest E2E 测试配置
 * 用于 API 测试、后端集成测试
 */
export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./server/tsconfig.json'] })],
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

    // 强制 vite 处理这些模块（包括动态 import）
    deps: {
      inline: [
        /@cdf-know\//,
        /@openclaw\//,
        /openclaw\/plugin-sdk/,
        /@cdfclaw\//,
      ],
    },

    server: {
      deps: {
        moduleDirectories: ['node_modules', 'packages', 'extensions'],
      },
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@src': path.resolve(__dirname, './src'),
      '@server': path.resolve(__dirname, './server'),
      'openclaw/plugin-sdk': path.resolve(__dirname, './server/engine/plugin-sdk/index.ts'),
      'openclaw/plugin-sdk/*': path.resolve(__dirname, './server/engine/plugin-sdk') + '/*',
      '@openclaw/media-core': path.resolve(__dirname, './packages/media-core/src/index.ts'),
      '@openclaw/media-core/*': path.resolve(__dirname, './packages/media-core/src') + '/*',
      '@openclaw/normalization-core': path.resolve(__dirname, './packages/normalization-core/src/index.ts'),
      '@openclaw/normalization-core/*': path.resolve(__dirname, './packages/normalization-core/src') + '/*',
      '@openclaw/llm-core': path.resolve(__dirname, './packages/llm-core/src/index.ts'),
      '@openclaw/llm-core/*': path.resolve(__dirname, './packages/llm-core/src') + '/*',
      '@openclaw/llm-runtime': path.resolve(__dirname, './packages/llm-runtime/src/index.ts'),
      '@openclaw/llm-runtime/*': path.resolve(__dirname, './packages/llm-runtime/src') + '/*',
      '@openclaw/model-catalog-core': path.resolve(__dirname, './packages/model-catalog-core/src/index.ts'),
      '@openclaw/model-catalog-core/*': path.resolve(__dirname, './packages/model-catalog-core/src') + '/*',
      '@openclaw/gateway-client': path.resolve(__dirname, './packages/gateway-client/src/index.ts'),
      '@openclaw/gateway-client/*': path.resolve(__dirname, './packages/gateway-client/src') + '/*',
      '@openclaw/gateway-protocol': path.resolve(__dirname, './packages/gateway-protocol/src/index.ts'),
      '@openclaw/gateway-protocol/*': path.resolve(__dirname, './packages/gateway-protocol/src') + '/*',
      '@openclaw/media-generation-core': path.resolve(__dirname, './packages/media-generation-core/src/index.ts'),
      '@openclaw/media-generation-core/*': path.resolve(__dirname, './packages/media-generation-core/src') + '/*',
      '@openclaw/media-understanding-common': path.resolve(__dirname, './packages/media-understanding-common/src/index.ts'),
      '@openclaw/media-understanding-common/*': path.resolve(__dirname, './packages/media-understanding-common/src') + '/*',
      '@openclaw/markdown-core': path.resolve(__dirname, './packages/markdown-core/src/index.ts'),
      '@openclaw/markdown-core/*': path.resolve(__dirname, './packages/markdown-core/src') + '/*',
      '@openclaw/acp-core': path.resolve(__dirname, './packages/acp-core/src/index.ts'),
      '@openclaw/acp-core/*': path.resolve(__dirname, './packages/acp-core/src') + '/*',
      '@openclaw/terminal-core': path.resolve(__dirname, './packages/terminal-core/src/index.ts'),
      '@openclaw/terminal-core/*': path.resolve(__dirname, './packages/terminal-core/src') + '/*',
      '@openclaw/net-policy': path.resolve(__dirname, './packages/net-policy/src/index.ts'),
      '@openclaw/net-policy/*': path.resolve(__dirname, './packages/net-policy/src') + '/*',
      '@openclaw/web-content-core': path.resolve(__dirname, './packages/web-content-core/src/index.ts'),
      '@openclaw/web-content-core/*': path.resolve(__dirname, './packages/web-content-core/src') + '/*',
      '@openclaw/speech-core': path.resolve(__dirname, './packages/speech-core/runtime-api.ts'),
      '@openclaw/speech-core/*': path.resolve(__dirname, './packages/speech-core') + '/*',
      '@openclaw/agent-core': path.resolve(__dirname, './packages/agent-core/src/index.ts'),
      '@openclaw/agent-core/*': path.resolve(__dirname, './packages/agent-core/src') + '/*',
      '@openclaw/tool-call-repair': path.resolve(__dirname, './packages/tool-call-repair/src/index.ts'),
      '@openclaw/tool-call-repair/*': path.resolve(__dirname, './packages/tool-call-repair/src') + '/*',
      '@openclaw/sdk': path.resolve(__dirname, './packages/sdk/src/index.ts'),
      '@openclaw/memory-host-sdk': path.resolve(__dirname, './packages/memory-host-sdk/src/index.ts'),
      '@openclaw/memory-host-sdk/*': path.resolve(__dirname, './packages/memory-host-sdk/src') + '/*',
      '@cdf-know/llm-core': path.resolve(__dirname, './packages/llm-core/src/index.ts'),
      '@cdf-know/llm-core/*': path.resolve(__dirname, './packages/llm-core/src') + '/*',
      '@cdf-know/model-catalog-core': path.resolve(__dirname, './packages/model-catalog-core/src/index.ts'),
      '@cdf-know/model-catalog-core/*': path.resolve(__dirname, './packages/model-catalog-core/src') + '/*',
      '@cdf-know/sdk': path.resolve(__dirname, './packages/sdk/src/index.ts'),
      '@cdf-know/sdk/*': path.resolve(__dirname, './packages/sdk/src') + '/*',
      '@cdf-know/gateway-client': path.resolve(__dirname, './packages/gateway-client/src/index.ts'),
      '@cdf-know/gateway-client/*': path.resolve(__dirname, './packages/gateway-client/src') + '/*',
      '@cdf-know/normalization-core': path.resolve(__dirname, './packages/normalization-core/src/index.ts'),
      '@cdf-know/normalization-core/*': path.resolve(__dirname, './packages/normalization-core/src') + '/*',
      '@cdf-know/memory-host-sdk': path.resolve(__dirname, './packages/memory-host-sdk/src/index.ts'),
      '@cdf-know/memory-host-sdk/*': path.resolve(__dirname, './packages/memory-host-sdk/src') + '/*',
      '@cdf-know/media-generation-core': path.resolve(__dirname, './packages/media-generation-core/src/index.ts'),
      '@cdf-know/media-generation-core/*': path.resolve(__dirname, './packages/media-generation-core/src') + '/*',
      '@cdf-know/gateway-protocol': path.resolve(__dirname, './packages/gateway-protocol/src/index.ts'),
      '@cdf-know/gateway-protocol/*': path.resolve(__dirname, './packages/gateway-protocol/src') + '/*',
    },
  },
});