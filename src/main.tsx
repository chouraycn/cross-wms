import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { checkAndMigrate } from './services/migration'
import { initFromApi as initWarehouseCapability } from './capabilities/warehouse'
import { initFromApi as initSkills } from './stores/skillStore'

// 先渲染 UI，再异步初始化后端数据。
// 后端 crash 时 fetch 可能长时间挂起，如果 render() 放在 await 之后会导致永久白屏。
try {
  const root = ReactDOM.createRoot(document.getElementById('root')!)
  root.render(<App />)
} catch (e: any) {
  console.error('[CrossWMS] React 渲染异常:', e?.message || String(e), e?.stack)
}

// 异步初始化：迁移 + Store 数据加载（不阻塞 UI 渲染）
async function bootstrap() {
  try {
    await checkAndMigrate()
    await Promise.all([initWarehouseCapability(), initSkills()])
  } catch (e) {
    console.error('[Bootstrap] Store 初始化失败:', e)
  }
}

bootstrap()
