import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
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

export default defineConfig({
  plugins: [react(), externalizeNodeBuiltins(), externalizeMissingPackages()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: [
      'src/__tests__/**/*.test.{ts,tsx}',
      'src/components/**/__tests__/**/*.test.{ts,tsx}',
      'src/hooks/**/__tests__/**/*.test.{ts,tsx}',
      'src/services/**/__tests__/**/*.test.{ts,tsx}',
      'src/stores/**/__tests__/**/*.test.{ts,tsx}',
      'server/__tests__/**/*.test.{ts,tsx}',
      'server/**/__tests__/**/*.test.{ts,tsx}',
      'server/engine/**/*.test.{ts,tsx}',
      'packages/**/__tests__/**/*.test.{ts,tsx}',
      'cli/src/**/__tests__/**/*.test.{ts,tsx}',
    ],
    deps: {
      // Force vitest to process (and thus mock) onnxruntime-node
      // even if it's a native CJS module
      optimizer: {
        // Exclude onnxruntime-node from dependency optimization
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
      // 阈值依据：v8 provider 行级统计偏低（大量文件 0% lines / 100% functions），
      // 因此 functions/branches 是主要门禁信号。
      // lines/statements 设在基线之上以阻止覆盖率回退，逐步向 70% 目标靠拢。
      // P1-②: 从 2%/40%/35%/2% 抬升至 5%/45%/40%/5%
      // P0-3: 从 5%/45%/40%/5% 抬升至 10%/50%/45%/10%
      // P0-4: 从 10%/50%/45%/10% 抬升至 40%/50%/45%/40%
      thresholds: {
        lines: 40,
        functions: 50,
        branches: 45,
        statements: 40,
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
      '@openclaw/media-core': path.resolve(__dirname, './packages/media-core/src'),
      '@cdf-know/normalization-core/string-coerce': path.resolve(__dirname, './packages/normalization-core/src/string-coerce.ts'),
      '@cdf-know/normalization-core/string-normalization': path.resolve(__dirname, './packages/normalization-core/src/string-normalization.ts'),
      '@cdf-know/normalization-core/number-coercion': path.resolve(__dirname, './packages/normalization-core/src/number-coercion.ts'),
      '@cdf-know/normalization-core/record-coerce': path.resolve(__dirname, './packages/normalization-core/src/record-coerce.ts'),
      '@cdf-know/normalization-core': path.resolve(__dirname, './packages/normalization-core/src'),
      '@openclaw/net-policy/ip': path.resolve(__dirname, './packages/net-policy/src/ip.ts'),
      '@openclaw/net-policy': path.resolve(__dirname, './packages/net-policy/src'),
      '@openclaw/acp-core/runtime/types': path.resolve(__dirname, './packages/acp-core/src/runtime/types.ts'),
      '@openclaw/acp-core/runtime/errors': path.resolve(__dirname, './packages/acp-core/src/runtime/errors.ts'),
      '@openclaw/acp-core/runtime': path.resolve(__dirname, './packages/acp-core/src/runtime/types.ts'),
      '@openclaw/acp-core': path.resolve(__dirname, './packages/acp-core/src'),
      '@cdf-know/model-catalog-core/provider-id': path.resolve(__dirname, './packages/model-catalog-core/src/provider-id.ts'),
      '@cdf-know/model-catalog-core': path.resolve(__dirname, './packages/model-catalog-core/src'),
      '@openclaw/terminal-core': path.resolve(__dirname, './packages/terminal-core/src'),
      '@cdf-know/gateway-protocol': path.resolve(__dirname, './packages/gateway-protocol/src'),
      '@cdf-know/llm-core': path.resolve(__dirname, './packages/llm-core/src'),
      '@openclaw/llm-runtime': path.resolve(__dirname, './packages/llm-runtime/src'),
      '@cdf-know/gateway-client': path.resolve(__dirname, './packages/gateway-client/src'),
      '@openclaw/markdown-core': path.resolve(__dirname, './packages/markdown-core/src'),
      '@cdf-know/media-generation-core': path.resolve(__dirname, './packages/media-generation-core/src'),
      '@openclaw/media-understanding-common': path.resolve(__dirname, './packages/media-understanding-common/src'),
      '@openclaw/speech-core': path.resolve(__dirname, './packages/speech-core/src'),
      '@openclaw/agent-core': path.resolve(__dirname, './packages/agent-core/src'),
      '@openclaw/tool-call-repair': path.resolve(__dirname, './packages/tool-call-repair/src'),
      '@cdf-know/sdk': path.resolve(__dirname, './packages/sdk/src'),
      '@cdf-know/memory-host-sdk': path.resolve(__dirname, './packages/memory-host-sdk/src'),
      '@openclaw/web-content-core': path.resolve(__dirname, './packages/web-content-core/src'),
      '@openclaw/proxyline': path.resolve(__dirname, './packages/net-policy/src/proxyline.ts'),
      '@openclaw-src': path.resolve(__dirname, './openclaw/src'),
    },
    conditions: ['node'],
  },
  ssr: {
    noExternal: ['@e965/xlsx'],
  },
});
