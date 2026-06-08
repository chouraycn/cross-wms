import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { version } from './package.json'
import type { Plugin } from 'vite'

/**
 * 修复 file:// 协议下的白屏问题
 * 1. 移除 crossorigin 属性（file:// 下会导致加载失败）
 * 2. 将 type="module" 改为 defer（file:// 下 WKWebView 不支持 ES Module）
 * 3. 移除无意义的 modulepreload（file:// 下无意义）
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
    // NOTE: file:// 协议下 WKWebView 不支持动态 import()，此处 manualChunks 生成的
    //       额外 <script> 标签会被 removeCrossorigin 插件转为 defer（经典脚本）。
    //       应用源代码不能拆分为独立 chunk：MUI/Emotion 运行时会在 chunk 间形成
    //       循环依赖（app → vendor-mui → @emotion → app），Rollup 无法静态解析
    //       加载顺序，会导致除 main 外的 chunk 不再注入 HTML <script> 标签。
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: 'index.html',
      },
      output: {
        manualChunks(id: string) {
          // MUI (Material UI) + @emotion 运行时 — 最大的单库
          if (id.includes('node_modules/@mui/') || id.includes('node_modules/@emotion/')) {
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
          // React Markdown 渲染相关（unified 生态 + syntax highlighter）
          if (
            id.includes('node_modules/react-markdown/') ||
            id.includes('node_modules/react-syntax-highlighter/') ||
            id.includes('node_modules/remark-gfm/') ||
            id.includes('node_modules/remark-parse/') ||
            id.includes('node_modules/remark-rehype/') ||
            id.includes('node_modules/rehype-raw/') ||
            id.includes('node_modules/rehype-sanitize/') ||
            id.includes('node_modules/rehype-stringify/') ||
            id.includes('node_modules/unified/') ||
            id.includes('node_modules/mdast-util') ||
            id.includes('node_modules/micromark') ||
            id.includes('node_modules/hast-util-') ||
            id.includes('node_modules/parse-entities/') ||
            id.includes('node_modules/character-entities') ||
            id.includes('node_modules/property-information/') ||
            id.includes('node_modules/vfile/') ||
            id.includes('node_modules/unist-util-') ||
            id.includes('node_modules/is-plain-obj/') ||
            id.includes('node_modules/ccount/') ||
            id.includes('node_modules/longest-streak/') ||
            id.includes('node_modules/zwitch/') ||
            id.includes('node_modules/truncate/') ||
            id.includes('node_modules/escape-string-regexp/') ||
            id.includes('node_modules/trim-lines/') ||
            id.includes('node_modules/mdast-builder/') ||
            id.includes('node_modules/hast-util-whitespace/')
          ) {
            return 'vendor-markdown';
          }
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
