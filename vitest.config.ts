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
      reporter: ['text', 'json', 'json-summary', 'html'],
      reportOnFailure: true,
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
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@src': path.resolve(__dirname, './src'),
    },
    conditions: ['node'],
  },
  ssr: {
    noExternal: ['@e965/xlsx'],
  },
});
