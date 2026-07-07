import './i18n';
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { checkAndMigrate } from './services/migration'
import { initFromApi as initWarehouseCapability } from './capabilities/warehouse'
import { initFromApi as initSkills } from './stores/skillStore'
import { initSentryReact } from './sentry'
import { initPerformanceTelemetry, markPhase, endPhase } from './services/performanceTelemetry'

// Initialize Sentry error monitoring (no-op if VITE_SENTRY_DSN is not set)
initSentryReact();

// 端到端性能采集初始化（必须在其他操作之前）
markPhase('app:bootstrap:start');
initPerformanceTelemetry();

// 先渲染 UI，再异步初始化后端数据。
// 后端 crash 时 fetch 可能长时间挂起，如果 render() 放在 await 之后会导致永久白屏。
try {
  const root = ReactDOM.createRoot(document.getElementById('root')!)
  root.render(<App />)
} catch (e: any) {
  const errMsg = e?.message || String(e);
  const errStack = e?.stack || '';
  const errorEl = document.getElementById('root-error');
  const loadingEl = document.getElementById('root-loading');
  if (errorEl) {
    errorEl.textContent = 'React 渲染异常: ' + errMsg + '\n' + errStack;
    errorEl.className = 'show';
  }
  if (loadingEl) {
    loadingEl.className = 'hide';
  }
  console.error('[CDFKnow] React 渲染异常:', errMsg, errStack);
}

// 异步初始化：迁移 + Store 数据加载（不阻塞 UI 渲染）
async function bootstrap() {
  markPhase('bootstrap:migration');
  try {
    await checkAndMigrate();
    endPhase('bootstrap:migration');

    markPhase('bootstrap:warehouse');
    await initWarehouseCapability();
    endPhase('bootstrap:warehouse');

    markPhase('bootstrap:skills');
    setTimeout(() => {
      initSkills()
        .then(() => endPhase('bootstrap:skills'))
        .catch(() => endPhase('bootstrap:skills', { error: true }));
    }, 500);
  } catch (e) {
    endPhase('bootstrap:migration', { error: true });
    // console.error('[Bootstrap] Store 初始化失败:', e)
  }
  endPhase('app:bootstrap:start', { completed: true });
}

bootstrap();

// ===================== 内存压力响应（WKWebView 原生回调） =====================
// Swift 端在 didReceiveMemoryWarning 时调用 window.cdfApp.onMemoryPressure()
(window as any).cdfApp = (window as any).cdfApp || {};
(window as any).cdfApp.onMemoryPressure = () => {
  console.log('[CDFKnow] Memory pressure received, cleaning up...');
  // 1. 清理 sessionStorage 中非必要数据
  try {
    const keysToKeep = ['cdf-know-clow-chat-sessions', 'theme-mode'];
    const allKeys = Object.keys(sessionStorage);
    for (const key of allKeys) {
      if (!keysToKeep.includes(key)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {}
  // 2. 通知 ContextWindowCache 清理（通过自定义事件）
  window.dispatchEvent(new CustomEvent('cdf-memory-pressure'));
};
