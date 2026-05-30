import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { version } from './package.json'
import type { Plugin } from 'vite'

/**
 * 修复 file:// 协议下的白屏问题
 * 1. 移除 crossorigin 属性（file:// 下会导致加载失败）
 * 2. 保留 type="module"（构建产物包含 import.meta，必须运行在 module 上下文）
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
          // 1. 移除 crossorigin 属性（file:// 下加载失败）
          source = source.replace(/\s+crossorigin(?:="[^"]*")?/g, '')
          // 2. 保留 type="module"（不改为 defer，因为产物包含 import.meta 语法）
          // 3. 去掉 modulepreload（file:// 下无意义）
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
    // 禁止 code splitting，消灭动态 import()
    // file:// 下 WKWebView 会拒绝动态导入
    rollupOptions: {
      input: {
        main: 'index.html',
      },
      output: {
        // 多入口场景下，使用 manualChunks 控制避免动态导入
        manualChunks: undefined,
      },
    },
    // 确保每个入口生成独立 chunk，避免动态导入
    target: 'esnext',
  },
})
