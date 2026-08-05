import { Box } from '@mui/material';
import { useEffect, useRef } from 'react';
import {
  ensureDefaultSession,
  getEnterpriseAuthSession,
  type EnterpriseAuthSession,
} from '../../components/staff/auth.js';

/**
 * StaffDeckEmbedPage — 员工栏目 100% 复刻入口。
 *
 * 设计：用全屏 iframe 加载已构建的 StaffDeck-main 原前端产物（/staffdeck-app/）。
 * 该产物是独立的 shadcn/Tailwind 构建，自带 Teal 设计系统，iframe 天然隔离主程序
 * MUI 主题，确保视觉与 StaffDeck-main 完全一致（不重写任何组件）。
 *
 * 登录态透传：
 * - 嵌入前端(iframe)在嵌入模式下以 default-user 直接进入、跳过登录页（后端无 token 时回退 default-user）。
 * - 若主程序已登录(本地有真实会话)，本页通过 postMessage 把会话下发给 iframe，iframe 接收后
 *   写入其 localStorage 并刷新以应用真实身份 —— 实现真正的「主程序登录态透传」。
 * - 生产环境父子同源(localStorage 共享)，本页 ensureDefaultSession 写入的会话 iframe 也能直接读到。
 *
 * 侧边栏整合：
 * - 注入 CSS 隐藏 iframe 内 StaffDeck 自带侧边栏，由主程序侧边栏统一承载导航。
 * - 通过 postMessage(STAFFDECK_NAVIGATE) 接收主程序侧边栏的导航指令，
 *   利用 history.pushState + popstate 事件驱动 iframe 内 React Router 导航。
 *
 * warehouseMode：仓库员工场景下 iframe 直接打开 /staffdeck-app/#/workspace/chat，
 * 让用户进入工作区聊天界面选择仓库相关 agent；默认场景下打开 /staffdeck-app/ 入口。
 */
const STAFFDECK_MSG_REQUEST_AUTH = 'STAFFDECK_REQUEST_AUTH';
const STAFFDECK_MSG_AUTH = 'STAFFDECK_AUTH';
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

export default function StaffDeckEmbedPage({ warehouseMode = false }: { warehouseMode?: boolean }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // 向 iframe 推送当前(或默认的)会话
  const pushSessionToIframe = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const session: EnterpriseAuthSession =
      getEnterpriseAuthSession() ?? ensureDefaultSession();
    iframe.contentWindow.postMessage(
      { type: STAFFDECK_MSG_AUTH, session },
      '*',
    );
  };

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
    // 确保本地有默认会话（同源时 iframe 可直接读到；也用于下发）
    ensureDefaultSession();

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === STAFFDECK_MSG_REQUEST_AUTH) {
        // iframe 请求会话 → 下发当前/默认会话
        pushSessionToIframe();
      } else if (event.data?.type === STAFFDECK_NAVIGATE && event.data?.route) {
        // 主程序侧边栏导航指令 → 驱动 iframe 内 React Router
        navigateIframe(event.data.route);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // 仓库员工场景：直接进入工作区聊天；默认场景：进入员工平台入口
  const iframeSrc = warehouseMode ? '/staffdeck-app/#/workspace/chat' : '/staffdeck-app/';

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        bgcolor: '#f7f5ef',
        overflow: 'hidden',
      }}
    >
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title={warehouseMode ? '仓库员工 StaffDeck' : '员工 StaffDeck'}
        onLoad={() => {
          pushSessionToIframe();
          injectHideSidebarCSS();
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
