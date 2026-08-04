import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { version } from './package.json'
import type { Plugin } from 'vite'

/**
 * 修复 file:// 协议下的白屏问题
 * 1. 移除 crossorigin 属性（file:// 下会导致加载失败）
 * 2. 将 type="module" 改为 defer（file:// 下 WKWebView 不支持 ES Module）
 * 3. 保留 modulepreload（HTTP 模式下可显著加速模块加载，file:// 下无意义但无害）
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
          // 3. 保留 modulepreload — Vite 自动生成的 modulepreload 对首屏性能至关重要。
          //    在 HTTP 模式下（pywebview 使用内置 HTTP 服务器），modulepreload 让浏览器
          //    可以并行预加载关键 JS 模块，避免串行解析导致的白屏。file:// 模式下无意义
          //    但无害，因此统一保留。
          chunk.source = source
        }
      }
    },
  }
}

/**
 * 定向清理陈旧构建产物
 *
 * 背景：build.emptyOutDir 被设为 false（防止 vite 清掉 dist/staffdeck-app/ 导致数字员工
 * iframe 白屏），副作用是 dist/assets/ 只增不减 —— 每次构建的 hash 产物全部堆积。
 * 2026-08-04 实测 762 个 JS chunk 去重后仅 174 个（78% 是历史死产物），其中 sourcemap
 * 占 58MB，且被 package-mac-app.sh 的 `cp -R dist/*` 原样拷进 DMG。
 *
 * 方案：不翻转 emptyOutDir（翻转后单跑 `npm run build` 之外的 `vite build` 仍会误删
 * staffdeck-app），改为在 buildStart 精确删除本次构建必定重新生成的目录。
 * 白名单外的内容（staffdeck-app/、public 拷贝物）一律保留。
 */
function cleanStaleAssets(): Plugin {
  let root = process.cwd()
  let outDir = 'dist'
  return {
    name: 'clean-stale-assets',
    apply: 'build',
    configResolved(config) {
      root = config.root
      outDir = config.build.outDir
    },
    buildStart() {
      // 仅清理 vite 自身完全重新生成的目录。index.html 等同名文件由 vite 覆盖写入，
      // 不会堆积；staffdeck-app/ 由独立构建产出，绝不能删。
      const assetsDir = path.resolve(root, outDir, 'assets')
      if (existsSync(assetsDir)) {
        rmSync(assetsDir, { recursive: true, force: true })
        console.log('[clean-stale-assets] 已清理 dist/assets/（保留 staffdeck-app/）')
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    cleanStaleAssets(),
    removeCrossorigin(),
  ],
  base: './', // 相对路径，file:// 协议下可正确解析
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  // v1.5.132: 生产构建自动剥离 console.log/debug，保留 console.warn/error
  esbuild: {
    pure: mode === 'production' ? ['console.log', 'console.debug'] : [],
  },
  // v1.9.3: 开发模式下将 /api 请求代理到后端，避免跨域问题（Electron/浏览器均兼容）
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        // v1.9.3: 确保 multipart/form-data 请求正确转发
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            console.error('[proxy] Backend connection error:', err.message);
            if (res && 'writeHead' in res) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Backend server unavailable', code: 'BACKEND_UNAVAILABLE' }));
            }
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // 仅在 debug 模式打印
            if (process.env.DEBUG_PROXY) {
              console.log('[proxy]', req.method, req.url);
            }
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            if (process.env.DEBUG_PROXY) {
              console.log('[proxy]', proxyRes.statusCode, req.url);
            }
          });
        },
      },
      // 数字员工嵌入前端(dev)：把 /staffdeck-app 静态产物代理到 express(3001)，
      // 使 iframe 与 vite 主程序同源，localStorage 共享且资源可加载。
      '/staffdeck-app': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        // 资源已在 StaffDeck 构建时加 /staffdeck-app 前缀，无需 rewrite
      },
      // v1.9.3: 代理 Ollama 本地 API，绕过浏览器 CORS 限制
      '/ollama-api': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama-api/, ''),
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    // 禁止 vite 清空 dist/ —— 默认 emptyOutDir:true 会一并删除 dist/staffdeck-app/，
    // 若后续未运行 staffdeck:build，数字员工 iframe 加载 /staffdeck-app/ 时白屏。
    // 设为 false 后，vite 仅覆盖自身产物(index.html/assets/)，staffdeck-app 得以保留。
    emptyOutDir: false,
    // 拆分大型依赖为独立 chunk
    // 路由组件通过 React.lazy() + import() 自动拆分为独立 chunk（Vite 内置代码分割）
    // manualChunks 仅处理第三方依赖拆分，应用代码由动态导入自动分割
    chunkSizeWarningLimit: 500,
    // WKWebView 兼容：强制转换 node_modules 中的 CommonJS 包为 ESM
    // 防止 Cannot set properties of undefined (setting 'exports') 错误
    // 关键：strictRequires: 'auto' 确保动态 require() 也被正确转换
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
      strictRequires: 'auto', // 强制转换所有 require() 调用（含动态拼接）
    },
    cssCodeSplit: true,
    sourcemap: 'hidden',
    reportCompressedSize: false,
    rollupOptions: {
      input: {
        main: 'index.html',
      },
      output: {
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        manualChunks(id: string) {
          // MUI icons — 单独拆分（非常大，但懒加载不影响首屏）
          if (id.includes('node_modules/@mui/icons-material/')) {
            return 'vendor-mui-icons';
          }
          // MUI X DataGrid — 单独拆分（高级数据展示组件）
          if (id.includes('node_modules/@mui/x-data-grid/')) {
            return 'vendor-mui-x';
          }
          // MUI core + @emotion 运行时 — 最大的单库
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
          // react-virtuoso — 虚拟滚动列表（ChatMessageList 使用）
          if (id.includes('node_modules/react-virtuoso/')) {
            return 'vendor-virtuoso';
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
          // KaTeX — LaTeX 数学公式渲染
          if (id.includes('node_modules/katex/')) {
            return 'vendor-katex';
          }
          // react-markdown + remark/rehype 生态包
          if (
            id.includes('node_modules/react-markdown/') ||
            id.includes('node_modules/remark') ||
            id.includes('node_modules/rehype') ||
            id.includes('node_modules/hast') ||
            id.includes('node_modules/mdast') ||
            id.includes('node_modules/micromark') ||
            id.includes('node_modules/unified/')
          ) {
            return 'vendor-markdown';
          }
          // React Query — 数据请求状态管理
          if (id.includes('node_modules/@tanstack/react-query/')) {
            return 'vendor-react-query';
          }
          // DnD Kit — 拖拽功能（WorkflowBuilder 使用）
          if (id.includes('node_modules/@dnd-kit/')) {
            return 'vendor-dnd-kit';
          }
          // Lucide React — 图标库
          if (id.includes('node_modules/lucide-react/')) {
            return 'vendor-lucide';
          }
          // Axios — HTTP 客户端
          if (id.includes('node_modules/axios/')) {
            return 'vendor-axios';
          }
          // Sentry — 错误监控
          if (id.includes('node_modules/@sentry/')) {
            return 'vendor-sentry';
          }
          // i18next — 国际化
          if (id.includes('node_modules/i18next/') || id.includes('node_modules/react-i18next/')) {
            return 'vendor-i18n';
          }
          // Lodash — 工具库
          if (id.includes('node_modules/lodash-es/')) {
            return 'vendor-lodash';
          }
          // Zod — 数据验证
          if (id.includes('node_modules/zod/')) {
            return 'vendor-zod';
          }
          // 不设 catch-all vendor-misc（会导致循环依赖），其余小包留在 main chunk
          return undefined;
        },
      },
    },
    target: ['es2020', 'edge88', 'chrome88', 'firefox78', 'safari14'], // WKWebView 兼容（macOS 11+）
  },
}))
