import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { version } from './package.json'

/**
 * Vite 插件：移除构建产物中的 crossorigin 属性
 * file:// 协议下 crossorigin 会触发 CORS 预检请求导致白屏
 */
function removeCrossorigin(): Plugin {
  return {
    name: 'remove-crossorigin',
    enforce: 'post',
    transformIndexHtml(html: string) {
      return html
        .replace(/ crossorigin/g, '')
        .replace(/ type="module"/g, ' defer');
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    removeCrossorigin(),
  ],
  base: './',
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  // 注入全局常量：__APP_VERSION__ 自动从 package.json 读取
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  // file:// 本地化：不需要 module preload
  build: {
    modulePreload: {
      resolveDependencies: () => [],
    },
  },
})
