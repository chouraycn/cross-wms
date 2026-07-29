import './i18n';
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
// StaffDeck 数字员工模块主题（CSS 变量 + 作用域 .sd-root 样式）。
// 必须引入，否则 bg-background / text-accent / sidebar-* 等工具类无变量来源，UI 样式悬空。
import './styles/staffdeck.css'
// StaffDeck-main 全量样式源（6079 行 v4→v3 移植，含全部 class 选择器 + keyframes + Semantic UI 段）。
// 作用域收敛到 .sd-root，避免污染主程序；class 选择器仅对用到对应 className 的元素生效。
import './styles/staffdeck-source.css'
// Inter 可变字体（本地资源）— 让数字员工模块 UI 西文使用 Inter，对齐 StaffDeck-main 设计
import './assets/fonts/inter/inter.css'
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
