import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { checkAndMigrate } from './services/migration'
import { initFromApi as initWarehouseCapability } from './capabilities/warehouse'
import { initFromApi as initSkills } from './stores/skillStore'

async function bootstrap() {
  // 开发环境下根据环境变量启用 MSW Mock
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK === 'true') {
    const { initMsw } = await import('./mocks')
    await initMsw()
  }

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
