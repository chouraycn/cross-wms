import { defineConfig } from 'vitest/config';
import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Vitest E2E 测试配置
 * 用于 API 测试、后端集成测试
 *
 * 注意：Vite 的 resolve.alias 对象形式会将 key 作为前缀匹配，
 * 导致 '@cdf-know/pkg' 拦截 '@cdf-know/pkg/sub' 并替换为错误路径。
 * 因此改用数组形式 + RegExp，精确区分精确匹配和子路径匹配。
 */

// 包名 → 源码目录（相对于项目根目录）
// exactIndex: 精确导入时的入口文件（默认 index.ts）
const packageMap: Array<{ pkg: string; src: string; exactIndex?: string }> = [
  { pkg: 'openclaw/plugin-sdk', src: './server/engine/plugin-sdk' },
  { pkg: '@openclaw/media-core', src: './packages/media-core/src' },
  { pkg: '@openclaw/normalization-core', src: './packages/normalization-core/src' },
  { pkg: '@openclaw/llm-core', src: './packages/llm-core/src' },
  { pkg: '@openclaw/llm-runtime', src: './packages/llm-runtime/src' },
  { pkg: '@openclaw/model-catalog-core', src: './packages/model-catalog-core/src' },
  { pkg: '@openclaw/gateway-client', src: './packages/gateway-client/src' },
  { pkg: '@openclaw/gateway-protocol', src: './packages/gateway-protocol/src' },
  { pkg: '@openclaw/media-generation-core', src: './packages/media-generation-core/src' },
  { pkg: '@openclaw/media-understanding-common', src: './packages/media-understanding-common/src' },
  { pkg: '@openclaw/markdown-core', src: './packages/markdown-core/src' },
  { pkg: '@openclaw/acp-core', src: './packages/acp-core/src' },
  { pkg: '@openclaw/terminal-core', src: './packages/terminal-core/src' },
  { pkg: '@openclaw/net-policy', src: './packages/net-policy/src' },
  { pkg: '@openclaw/web-content-core', src: './packages/web-content-core/src' },
  { pkg: '@openclaw/speech-core', src: './packages/speech-core', exactIndex: 'runtime-api.ts' },
  { pkg: '@openclaw/agent-core', src: './packages/agent-core/src' },
  { pkg: '@openclaw/tool-call-repair', src: './packages/tool-call-repair/src' },
  { pkg: '@openclaw/sdk', src: './packages/sdk/src' },
  { pkg: '@openclaw/memory-host-sdk', src: './packages/memory-host-sdk/src' },

  // @cdf-know/* 别名（与 @openclaw/* 指向相同的源码目录）
  { pkg: '@cdf-know/llm-core', src: './packages/llm-core/src' },
  { pkg: '@cdf-know/model-catalog-core', src: './packages/model-catalog-core/src' },
  { pkg: '@cdf-know/sdk', src: './packages/sdk/src' },
  { pkg: '@cdf-know/gateway-client', src: './packages/gateway-client/src' },
  { pkg: '@cdf-know/normalization-core', src: './packages/normalization-core/src' },
  { pkg: '@cdf-know/memory-host-sdk', src: './packages/memory-host-sdk/src' },
  { pkg: '@cdf-know/media-generation-core', src: './packages/media-generation-core/src' },
  { pkg: '@cdf-know/gateway-protocol', src: './packages/gateway-protocol/src' },
  { pkg: '@cdf-know/plugin-sdk', src: './packages/plugin-sdk/src' },
  { pkg: '@cdf-know/acp-core', src: './packages/acp-core/src' },
  { pkg: '@cdf-know/media-core', src: './packages/media-core/src' },
];

// 转义字符串为正则安全形式
function escapeRegex(str: string): string {
  return str.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '\\/');
}

// 为每个包生成精确匹配 + 子路径匹配的 alias 数组
const pkgAliases = packageMap.flatMap(({ pkg, src, exactIndex }) => {
  const abs = path.resolve(__dirname, src);
  const escaped = escapeRegex(pkg);
  const indexFile = exactIndex ?? 'index.ts';
  return [
    // 子路径：@pkg/sub → abs/sub（先匹配，避免被精确匹配拦截）
    { find: new RegExp(`^${escaped}/(.+)$`), replacement: `${abs}/$1` },
    // 精确匹配：@pkg → abs/indexFile
    { find: new RegExp(`^${escaped}$`), replacement: `${abs}/${indexFile}` },
  ];
});

// @openclaw/* 通配 → extensions/*（放在具体 @openclaw/xxx 之后，确保具体包优先匹配）
const openclawWildcard = {
  find: /^@openclaw\/(.+)$/,
  replacement: path.resolve(__dirname, './extensions') + '/$1',
};

// @openclaw-src/* → openclaw/src/*
const openclawSrcWildcard = {
  find: /^@openclaw-src\/(.+)$/,
  replacement: path.resolve(__dirname, './openclaw/src') + '/$1',
};

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./server/tsconfig.json'] })],
  test: {
    // 测试环境
    globals: true,
    environment: 'node',

    // 测试匹配模式：contracts 目录是 P2-1 API 契约测试入口（与 npm run test:contracts 对齐）
    include: ['e2e/api/**/*.test.ts', 'tests/contracts/**/*.test.ts'],

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
    alias: [
      // @/ @src/ @server/ — 使用 RegExp 避免前缀匹配冲突
      { find: /^@\/(.+)$/, replacement: path.resolve(__dirname, './src') + '/$1' },
      { find: /^@src\/(.+)$/, replacement: path.resolve(__dirname, './src') + '/$1' },
      { find: /^@server\/(.+)$/, replacement: path.resolve(__dirname, './server') + '/$1' },

      // 包级别别名（精确匹配 + 子路径匹配）
      ...pkgAliases,

      // @openclaw/fs-safe/* → server stubs（openclaw 子模块依赖的 fs-safe 子包统一降级到 stub）
      // 必须放在 @openclaw/* 通配之前，否则会被通配符拦截到 extensions/fs-safe/（缺少 config/path/secret/json 等子模块）
      { find: /^@openclaw\/fs-safe(\/.*)?$/, replacement: path.resolve(__dirname, './server/engine/infra/_fs-safe-stubs.ts') },

      // @openclaw/* 通配 → extensions/*
      openclawWildcard,

      // @openclaw-src/* → openclaw/src/*
      openclawSrcWildcard,
    ],
  },
});
