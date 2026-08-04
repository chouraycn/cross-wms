import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { builtinModules } from 'module';
import type { Plugin } from 'vite';

const nodeBuiltinSet = new Set(builtinModules);

/**
 * 外部化 Node.js 内置模块（enforce: 'pre'）。详见 vitest.config.ts。
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
 * 外部化未安装的可选依赖（pdf-lib / tesseract.js）。
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

/**
 * Engine 测试隔离配置。
 *
 * 背景：默认 vitest.config.ts 的 include 含 server/engine 下所有 *.test.{ts,tsx} 文件，
 * 把 4,137 个上游引擎测试（约 156 万行）拉进 `npm test`，导致默认测试极慢且易 OOM。
 * 本配置让 `server/engine` 测试可**单独**运行（`npm run test:engine`），
 * 默认 `npm run test` 行为完全不变、零回归。
 *
 * 这是「engine 测试拆分」的安全前置步骤：先把重测试从默认套件中**可隔离运行**，
 * 待测得覆盖率基线后，再决定是否把 engine 从默认 include 中移除（届时需要配套门禁，
 * 否则会静默丢失 engine 覆盖率）。
 */
export default defineConfig({
  plugins: [react(), externalizeNodeBuiltins(), externalizeMissingPackages()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['server/engine/**/*.test.{ts,tsx}'],
    deps: {
      optimizer: {
        exclude: ['onnxruntime-node'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'json-summary', 'lcov', 'html'],
      reportOnFailure: true,
      // 阈值与 vitest.config.ts 主套件一致；lines/statements 设在基线之下防 CI 立即失败。
      // engine 真实覆盖率基线需在真机/CI 跑一次本配置后回填。
      thresholds: {
        lines: 2,
        functions: 40,
        branches: 35,
        statements: 2,
        perFile: false,
      },
      include: [
        'server/engine/**',
        'server/aiClient.ts',
        'server/routes/chatService.ts',
        'server/storage/migration.ts',
        'server/channels/access/allowlist.ts',
        'server/keyRotator.ts',
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
