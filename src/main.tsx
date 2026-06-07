import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { checkAndMigrate } from './services/migration'
import { initFromApi as initWarehouseCapability } from './capabilities/warehouse'
import { initFromApi as initSkills } from './stores/skillStore'

// ⚠️ P0 诊断：捕获全局 JS 错误并显示在页面上（WKWebView 无 DevTools）
let fatalDisplay: HTMLDivElement | null = null
function showFatalError(label: string, msg: string, detail?: string) {
  if (fatalDisplay) return // 只显示第一个错误
  fatalDisplay = document.createElement('div')
  fatalDisplay.style.cssText =
    'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#FEF2F2;color:#991B1B;font-family:monospace;padding:24px;text-align:center'
  fatalDisplay.innerHTML = `
    <div style="font-size:18px;font-weight:700;margin-bottom:8px">❌ ${label}</div>
    <div style="font-size:13px;margin-bottom:12px;max-width:600px;word-break:break-word">${msg}</div>
    ${detail ? `<pre style="font-size:11px;color:#7F1D1D;background:#FEE2E2;padding:12px;border-radius:6px;max-width:100%;overflow-x:auto;text-align:left">${detail}</pre>` : ''}
    <div style="margin-top:16px;font-size:11px;color:#B45309">请查看日志: ~/.crosswms/logs/crosswms.log</div>
  `
  document.body.appendChild(fatalDisplay)
}

window.addEventListener('error', (evt) => {
  if (evt.filename?.includes('main-') || evt.filename?.endsWith('.js')) {
    showFatalError('前端 JS 运行时错误',
      `${evt.message}`,
      `文件: ${evt.filename || '?'}:${evt.lineno}:${evt.colno}`
    )
  }
})

window.addEventListener('unhandledrejection', (evt) => {
  const msg = evt.reason?.message || evt.reason?.toString?.() || '未知 Promise 拒绝'
  showFatalError('未处理的 Promise 异常', msg)
})

// ⚠️ P0: 先渲染 UI，再异步初始化后端数据。
// 后端 crash 时 fetch 可能长时间挂起，如果 render() 放在 await 之后会导致永久白屏。
try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
} catch (e: any) {
  showFatalError('React 渲染异常',
    e?.message || String(e),
    e?.stack
  )
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
