import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import os from 'os';
import { builtinModules } from 'module';
import type { Plugin } from 'vite';

const nodeBuiltinSet = new Set(builtinModules);

/**
 * 外部化 Node.js 内置模块（enforce: 'pre'）。
 *
 * 问题：Vitest 在 jsdom 环境下使用 web transform mode，Vite 的内置 resolve 插件
 * 会将 `https`、`fs` 等 Node.js 内置模块当作 npm 包解析，导致
 * "Failed to resolve entry for package" 错误。
 *
 * 使用 enforce: 'pre' 确保在 Vite 内置 resolve 插件之前拦截，返回 external 标记。
 * 运行时由 Node.js 原生加载这些内置模块。
 */
function externalizeNodeBuiltins(): Plugin {
  return {
    name: 'vitest-externalize-node-builtins',
    enforce: 'pre',
    resolveId(id) {
      const bareId = id.startsWith('node:') ? id.slice(5) : id;
      if (nodeBuiltinSet.has(bareId)) {
        return { id, external: true };
      }
      return null;
    },
  };
}

/**
 * 外部化未安装的可选依赖（普通优先级）。
 *
 * pdf-lib、tesseract.js 等包未安装但在代码中通过动态 import 引用。
 * Vite 的 import-analysis 在转换阶段会尝试解析这些包并失败。
 *
 * 不使用 enforce: 'pre'，确保 Vitest 的 mock 插件优先拦截已 mock 的模块（如 pdf-lib）。
 * 仅当 mock 插件未拦截时（转换阶段 mock 尚未注册），此插件作为 fallback 外部化这些包。
 * 运行时由 vi.mock 或代码中的 try-catch 处理。
 */
function externalizeMissingPackages(): Plugin {
  const missingPackages = ['pdf-lib', 'tesseract.js'];
  return {
    name: 'vitest-externalize-missing',
    resolveId(id) {
      if (missingPackages.includes(id)) {
        return { id, external: true };
      }
      return null;
    },
  };
}

const isCI = !!process.env.CI;

export default defineConfig({
  plugins: [react(), externalizeNodeBuiltins(), externalizeMissingPackages()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    // CI 环境默认 4 个进程（threads 开销大）；local 按 CPU 一半
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: isCI ? false : false,
        // CI ubuntu-latest 默认 2 vCPU，设为 2 避免上下文切换；local 至少保留 2
        minForks: isCI ? 2 : 2,
        maxForks: isCI ? 2 : Math.max(2, Math.ceil(os.cpus().length / 2)),
        isolate: true,
      },
    },
    // 单个测试超时：避免某个测试卡住拖垮整个 run
    testTimeout: isCI ? 60_000 : 600_000,
    hookTimeout: isCI ? 30_000 : 600_000,
    teardownTimeout: isCI ? 15_000 : 120_000,
    // 打印慢测试，辅助定位瓶颈
    slowTestThreshold: isCI ? 15_000 : 50_000,
    // CI 环境不再重试失败（避免时间翻倍）；本地 dev 可以 retry 1 次
    retry: isCI ? 0 : 1,
    cache: {
      dir: '.vitest-cache',
    },
    // H1: 主套件完全排除 server/engine/**，engine 重测试由 `npm run test:engine`
    // 单独运行（vitest.config.engine.ts）。CI 中先构建 openclaw dist 再单独触发 engine
    // 门禁，避免主套件出现 ~30 个 engine helper 别名解析失败、测试静默漏覆盖。
    include: [
      'src/__tests__/**/*.test.{ts,tsx}',
      'src/components/**/__tests__/**/*.test.{ts,tsx}',
      'src/hooks/**/__tests__/**/*.test.{ts,tsx}',
      'src/services/**/__tests__/**/*.test.{ts,tsx}',
      'src/stores/**/__tests__/**/*.test.{ts,tsx}',
      'server/__tests__/**/*.test.{ts,tsx}',
      'server/**/__tests__/**/*.test.{ts,tsx}',
      'packages/**/__tests__/**/*.test.{ts,tsx}',
      'cli/src/**/__tests__/**/*.test.{ts,tsx}',
      'extensions/**/__tests__/**/*.test.{ts,tsx}',
    ],
    exclude: [
      'server/engine/**',
    ],
    deps: {
      optimizer: {
        exclude: ['onnxruntime-node'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'json-summary', 'lcov', 'html'],
      reportOnFailure: true,
      // 覆盖率门禁：vitest 在 thresholds 不满足时会直接 fail（退出码非 0），
      // 构成 CI 的主门禁。下方 shell 检查作为打印数值的辅助诊断。
      //
      // 阈值依据：当前 v8 provider 实测基线为 lines 4.99% / functions 86.44% /
      // branches 83.38% / statements 4.99%。其中 lines/statements 偏低是 v8 provider
      // 对被 import 的 TS 模块行级覆盖统计偏低（大量文件 0% lines / 100% functions），
      // 因此 functions/branches 是主要门禁信号（对应任务中间目标 40%/35%）。
      // lines/statements 设在基线之下以避免 CI 立即失败，同时阻止覆盖率回退。
      // 后续随覆盖率提升逐步上调，最终目标 70%。
      thresholds: {
        lines: 2,
        functions: 40,
        branches: 35,
        statements: 2,
        perFile: false,
      },
      include: [
        'src/services/**',
        'src/stores/**',
        'src/capabilities/**',
        'server/aiClient.ts',
        'server/engine/reactExecutor.ts',
        'server/routes/chatService.ts',
        'server/engine/toolRegistry.ts',
        'server/engine/budgetManager.ts',
        'server/engine/loopDetector.ts',
        'server/engine/multilingualIntent.ts',
        'server/engine/contextTruncate.ts',
        'server/engine/crypto.ts',
        'server/engine/secretsStore.ts',
        'server/storage/migration.ts',
        'server/engine/messageArchive.ts',
        'server/channels/access/allowlist.ts',
        'server/keyRotator.ts',
        'server/engine/contextCompress.ts',
        'server/engine/compaction-planning.ts',
        'server/engine/compaction-identifier.ts',
        'server/engine/loopDetector.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.d.ts',
        '**/node_modules/**',
        '**/__tests__/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@src': path.resolve(__dirname, './src'),
      '@openclaw/media-core/constants': path.resolve(__dirname, './packages/media-core/src/constants.ts'),
      '@openclaw/media-core/content-length': path.resolve(__dirname, './packages/media-core/src/content-length.ts'),
      '@openclaw/media-core/file-name': path.resolve(__dirname, './packages/media-core/src/file-name.ts'),
      '@openclaw/media-core/mime': path.resolve(__dirname, './packages/media-core/src/mime.ts'),
      '@openclaw/media-core/read-response-with-limit': path.resolve(__dirname, './packages/media-core/src/read-response-with-limit.ts'),
      '@openclaw/media-core/inbound-path-policy': path.resolve(__dirname, './packages/media-core/src/inbound-path-policy.ts'),
      '@openclaw/media-core/base64': path.resolve(__dirname, './packages/media-core/src/base64.ts'),
      '@openclaw/media-core': path.resolve(__dirname, './packages/media-core/src/index.ts'),
      '@openclaw/normalization-core/string-coerce': path.resolve(__dirname, './packages/normalization-core/src/string-coerce.ts'),
      '@openclaw/normalization-core/string-normalization': path.resolve(__dirname, './packages/normalization-core/src/string-normalization.ts'),
      '@openclaw/normalization-core/number-coercion': path.resolve(__dirname, './packages/normalization-core/src/number-coercion.ts'),
      '@openclaw/normalization-core/record-coerce': path.resolve(__dirname, './packages/normalization-core/src/record-coerce.ts'),
      '@openclaw/normalization-core': path.resolve(__dirname, './packages/normalization-core/src/index.ts'),
      '@openclaw/net-policy/ip': path.resolve(__dirname, './packages/net-policy/src/ip.ts'),
      '@openclaw/net-policy': path.resolve(__dirname, './packages/net-policy/src/index.ts'),
      '@openclaw/acp-core/runtime/types': path.resolve(__dirname, './packages/acp-core/src/runtime/types.ts'),
      '@openclaw/acp-core': path.resolve(__dirname, './packages/acp-core/src/index.ts'),
      '@openclaw/model-catalog-core/provider-id': path.resolve(__dirname, './packages/model-catalog-core/src/provider-id.ts'),
      '@openclaw/model-catalog-core': path.resolve(__dirname, './packages/model-catalog-core/src/index.ts'),
      '@openclaw/terminal-core': path.resolve(__dirname, './packages/terminal-core/src/index.ts'),
      '@openclaw/gateway-protocol': path.resolve(__dirname, './packages/gateway-protocol/src/index.ts'),
      '@openclaw/llm-core': path.resolve(__dirname, './packages/llm-core/src/index.ts'),
      '@openclaw/llm-runtime': path.resolve(__dirname, './packages/llm-runtime/src/index.ts'),
      '@openclaw/gateway-client': path.resolve(__dirname, './packages/gateway-client/src/index.ts'),
      '@openclaw/markdown-core': path.resolve(__dirname, './packages/markdown-core/src/index.ts'),
      '@openclaw/media-generation-core': path.resolve(__dirname, './packages/media-generation-core/src/index.ts'),
      '@openclaw/media-understanding-common': path.resolve(__dirname, './packages/media-understanding-common/src/index.ts'),
      '@openclaw/speech-core': path.resolve(__dirname, './packages/speech-core/src/index.ts'),
      '@openclaw/agent-core': path.resolve(__dirname, './packages/agent-core/src/index.ts'),
      '@openclaw/tool-call-repair': path.resolve(__dirname, './packages/tool-call-repair/src/index.ts'),
      '@openclaw/sdk': path.resolve(__dirname, './packages/sdk/src/index.ts'),
      '@openclaw/memory-host-sdk': path.resolve(__dirname, './packages/memory-host-sdk/src/index.ts'),
      '@openclaw/web-content-core': path.resolve(__dirname, './packages/web-content-core/src/index.ts'),
      '@openclaw/proxyline': path.resolve(__dirname, './packages/net-policy/src/proxyline.ts'),
    },
    conditions: ['node'],
  },
  ssr: {
    noExternal: ['@e965/xlsx'],
  },
});
