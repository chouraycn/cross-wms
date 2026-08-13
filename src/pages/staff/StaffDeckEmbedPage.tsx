import { Box } from '@mui/material';
import { useEffect, useRef } from 'react';

/**
 * StaffDeckEmbedPage — 员工栏目 100% 复刻入口。
 *
 * 设计：用全屏 iframe 加载已构建的 StaffDeck-main 原前端产物（/staffdeck-app/）。
 * 该产物是独立的 shadcn/Tailwind 构建，自带 Teal 设计系统，iframe 天然隔离主程序
 * MUI 主题，确保视觉与 StaffDeck-main 完全一致（不重写任何组件）。
 *
 * 桌面端无员工认证登录体系：前后端均默认 default-user（admin）身份直接进入，
 * 无需单独登录页或登录态透传。
 *
 * 侧边栏整合：
 * - 注入 CSS 隐藏 iframe 内 StaffDeck 自带侧边栏，由主程序侧边栏统一承载导航。
 * - 通过 postMessage(STAFFDECK_NAVIGATE) 接收主程序侧边栏的导航指令，
 *   利用 history.pushState + popstate 事件驱动 iframe 内 React Router 导航。
 *
 * warehouseMode：仓库员工场景下 iframe 直接打开 /staffdeck-app/#/workspace/chat，
 * 让用户进入工作区聊天界面选择仓库相关 agent；默认场景下打开 /staffdeck-app/ 入口。
 */
const STAFFDECK_NAVIGATE = 'STAFFDECK_NAVIGATE';

/** 隐藏 iframe 内 StaffDeck 侧边栏，让主程序侧边栏统一承载导航 */
const HIDE_SIDEBAR_CSS = `
[data-slot="sidebar"] { display: none !important; }
[data-slot="sidebar-gap"] { display: none !important; width: 0 !important; }
[data-slot="sidebar-wrapper"] { padding-left: 0 !important; }
.app-shell { --sidebar-width: 0px !important; --sidebar-width-icon: 0px !important; }
`;

/** 注入到 iframe 的脚本：监听路由变化并通知父窗口 */
const ROUTE_TRACKER_JS = `
(function() {
  if (window.__cdfRouteTracker) return;
  window.__cdfRouteTracker = true;
  function getRoute() {
    var p = window.location.pathname.replace(/^\\/staffdeck-app/, '');
    return p || '/';
  }
  function notify() {
    window.parent.postMessage({ type: 'STAFFDECK_ROUTE_CHANGE', route: getRoute() }, '*');
  }
  // 初次通知
  setTimeout(notify, 300);
  // 监听 popstate
  window.addEventListener('popstate', notify);
  // Monkey-patch pushState/replaceState 以捕获程序化导航
  var origPush = window.history.pushState;
  var origReplace = window.history.replaceState;
  window.history.pushState = function() {
    var r = origPush.apply(this, arguments);
    setTimeout(notify, 0);
    return r;
  };
  window.history.replaceState = function() {
    var r = origReplace.apply(this, arguments);
    setTimeout(notify, 0);
    return r;
  };
})();
`;

export default function StaffDeckEmbedPage({ warehouseMode = false, sidebarCollapsed = false }: { warehouseMode?: boolean; sidebarCollapsed?: boolean }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  /** 注入 CSS 隐藏 iframe 内的 StaffDeck 侧边栏 + 注入路由追踪脚本 */
  const injectHideSidebarCSS = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const doc = iframe.contentDocument;
    // 避免重复注入
    if (doc.getElementById('cdf-hide-staffdeck-sidebar')) return;
    const style = doc.createElement('style');
    style.id = 'cdf-hide-staffdeck-sidebar';
    style.textContent = HIDE_SIDEBAR_CSS;
    doc.head.appendChild(style);
    // 注入路由追踪脚本
    const script = doc.createElement('script');
    script.id = 'cdf-staffdeck-route-tracker';
    script.textContent = ROUTE_TRACKER_JS;
    doc.head.appendChild(script);
  };

  /** 在 iframe 内部导航到指定 StaffDeck 路由 */
  const navigateIframe = (route: string) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const win = iframe.contentWindow;
    // StaffDeck 使用 BrowserRouter(basename="/staffdeck-app")
    // 通过 history.pushState + popstate 事件触发 React Router 导航
    const fullPath = `/staffdeck-app${route}`;
    try {
      win.history.pushState({}, '', fullPath);
      win.dispatchEvent(new PopStateEvent('popstate'));
    } catch {
      // 跨域 fallback：直接修改 iframe src
      iframe.src = `/staffdeck-app/#${route}`;
    }
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === STAFFDECK_NAVIGATE && event.data?.route) {
        // 主程序侧边栏导航指令 → 驱动 iframe 内 React Router
        navigateIframe(event.data.route);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // 仓库员工场景：直接进入工作区聊天；默认场景：进入员工平台入口
  const iframeSrc = warehouseMode ? '/staffdeck-app/#/workspace/chat' : '/staffdeck-app/';

  // 侧边栏收起时，顶部避让 GlobalActionsBar 按钮组（toggle + 新建对话）
  // 按钮位于 top:21px、高度约 26px，需约 50px 的顶部偏移
  const topOffset = sidebarCollapsed ? '50px' : 0;

  return (
    <Box
      sx={{
        position: 'absolute',
        top: topOffset,
        left: 0,
        right: 0,
        bottom: 0,
        width: 'auto',
        height: 'auto',
        bgcolor: '#f7f5ef',
        overflow: 'hidden',
      }}
    >
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title={warehouseMode ? '仓库员工 StaffDeck' : '员工 StaffDeck'}
        onLoad={() => {
          injectHideSidebarCSS();
          // 仓库员工场景：iframe 加载后默认选中仓库专员（seed-agent-warehouse-specialist）
          // StaffDeck 内部通过 localStorage 'ultrarag_enterprise_agent_scope' 读取当前员工
          if (warehouseMode) {
            try {
              const win = iframeRef.current?.contentWindow as (Window & typeof globalThis) | null;
              if (win) {
                win.localStorage.setItem('ultrarag_enterprise_agent_scope', 'seed-agent-warehouse-specialist');
              }
            } catch { /* 跨域忽略 */ }
          }
        }}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
      />
    </Box>
  );
}
