import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { version } from './package.json'
import type { Plugin } from 'vite'

/**
 * 修复 file:// 协议下的白屏问题
 * 1. 移除 crossorigin 属性（file:// 下会导致加载失败）
 * 2. 将 type="module" 改为 defer（file:// 下 WKWebView 不支持 ES Module）
 * 3. 移除无意义的 modulepreload（file:// 下无意义）
 *
 * NOTE: 应用使用 React.lazy() + import() 实现路由级懒加载，
 *       Vite 会自动为动态导入生成独立 chunk。
 *       HTTP 服务器模式下 chunk 通过 JS 运行时按需加载，无需额外 script 标签。
 */
function removeCrossorigin(): Plugin {
  return {
    name: 'remove-crossorigin',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const [key, chunk] of Object.entries(bundle)) {
        if (key.endsWith('.html') && chunk.type === 'asset') {
          let source = typeof chunk.source === 'string' ? chunk.source : ''
          // 1. 移除 crossorigin 属性（file:// 下加载失败，HTTP 模式下可保留但不影响）
          source = source.replace(/\s+crossorigin(?:="[^"]*")?/g, '')
          // 2. 保留 type="module"（HTTP 服务器模式下 WKWebView 支持 ES Module，不再改为 defer）
          // 3. 去掉 modulepreload（file:// 下无意义，HTTP 模式下也无需保留以保证兼容性）
          source = source.replace(/<link\s+rel="modulepreload"[^>]*>/g, '')
          chunk.source = source
        }
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    removeCrossorigin(),
  ],
  base: './', // 相对路径，file:// 协议下可正确解析
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    // 拆分大型依赖为独立 chunk
    // 路由组件通过 React.lazy() + import() 自动拆分为独立 chunk（Vite 内置代码分割）
    // manualChunks 仅处理第三方依赖拆分，应用代码由动态导入自动分割
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: 'index.html',
      },
      output: {
        manualChunks(id: string) {
          // MUI (Material UI) + @emotion 运行时 — 最大的单库
          if (id.includes('node_modules/@mui/') || id.includes('node_modules/@emotion/') || id.includes('node_modules/property-information/')) {
            return 'vendor-mui';
          }
          // React 核心 + 调度器（scheduler）+ react-dom
          if (
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          // Recharts 图表库 + d3 子依赖
          if (id.includes('node_modules/recharts/') || id.includes('node_modules/d3-')) {
            return 'vendor-recharts';
          }
          // React Router
          if (id.includes('node_modules/react-router-dom/') || id.includes('node_modules/react-router/')) {
            return 'vendor-router';
          }
          // React Markdown 渲染相关
          // ⚠️ 不再单独拆分 vendor-markdown chunk
          // 原因：markdown 生态包（hast-util-*、property-information 等）与 MUI/@emotion 存在共享依赖
          // 强制拆分会产生 vendor-mui ↔ vendor-markdown 循环依赖，导致运行时白屏
          // 让 Vite 自动处理这些包的归属，避免循环依赖
          // 工具库（dayjs/uuid/fflate/clsx 等）
          if (
            id.includes('node_modules/dayjs/') ||
            id.includes('node_modules/uuid/') ||
            id.includes('node_modules/clsx/') ||
            id.includes('node_modules/fflate/')
          ) {
            return 'vendor-utils';
          }
          // js-yaml — YAML 解析库（skillMdParser 使用）
          if (id.includes('node_modules/js-yaml/')) {
            return 'vendor-js-yaml';
          }
          // 不设 catch-all vendor-misc（会导致循环依赖），其余小包留在 main chunk
          return undefined;
        },
      },
    },
    target: 'esnext',
  },
})
