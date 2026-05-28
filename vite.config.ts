import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { version } from './package.json'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  base: '/',
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  // 注入全局常量：__APP_VERSION__ 自动从 package.json 读取
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-mui': [
            '@mui/material',
            '@mui/icons-material',
            '@emotion/react',
            '@emotion/styled',
          ],
          'vendor-recharts': ['recharts'],
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
          'vendor-dayjs': ['dayjs'],
        },
      },
    },
  },
})
