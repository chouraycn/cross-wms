import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { checkAndMigrate } from './services/migration'
import { initFromApi as initWarehouseCapability } from './capabilities/warehouse'
import { initFromApi as initSkills } from './stores/skillStore'

async function bootstrap() {
  // NOTE: 不使用动态 import() — file:// 协议下 WKWebView 不支持
  // MSW Mock 仅在 dev 环境通过 Vite dev server 加载，生产构建不需要

  // SQLite 持久化：迁移 + Store 初始化
  try {
    await checkAndMigrate()
    await Promise.all([initWarehouseCapability(), initSkills()])
  } catch (e) {
    console.error('[Bootstrap] Store 初始化失败:', e)
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

bootstrap()
