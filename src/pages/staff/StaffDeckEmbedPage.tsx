import { Box, Skeleton } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

/**
 * StaffDeckEmbedPage — 员工栏目 100% 复刻入口。
 *
 * 防闪屏要点：
 * - iframe.src 固定为 /staffdeck-app/（冷加载一次就好），
 *   warehouseMode 切换走内部 history.pushState，避免 src 属性改变导致 iframe 整包重载。
 * - 冷加载期间（iframe onload 触发前）显示 shadcn 风格骨架屏，
 *   让用户感知"页面正在来"而不是纯白白底等 1~2s。
 * - 10s 超时兜底：iframe 迟迟没 onload 时隐藏骨架显示空白（避免一直挂骨架）。
 */
const STAFFDECK_NAVIGATE = 'STAFFDECK_NAVIGATE';
const IFRAME_LOAD_TIMEOUT_MS = 10_000;

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
    try { window.parent.postMessage({ type: 'STAFFDECK_ROUTE_CHANGE', route: getRoute() }, '*'); } catch {}
  }
  setTimeout(notify, 300);
  window.addEventListener('popstate', notify);
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

export default function StaffDeckEmbedPage({
  warehouseMode = false,
  sidebarCollapsed = false,
}: {
  warehouseMode?: boolean;
  sidebarCollapsed?: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const warehouseAppliedRef = useRef(false);
  const iframeBaseSrc = '/staffdeck-app/';
  const loadTimeoutRef = useRef<number | null>(null);

  // iframe 是否已完成 onload（骨架屏显示开关）
  const [iframeLoaded, setIframeLoaded] = useState<boolean>(false);

  /** 注入 CSS 隐藏 iframe 内的 StaffDeck 侧边栏 + 注入路由追踪脚本 */
  const injectSidebarHiding = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const doc = iframe.contentDocument;
    try {
      if (!doc.getElementById('cdf-hide-staffdeck-sidebar')) {
        const style = doc.createElement('style');
        style.id = 'cdf-hide-staffdeck-sidebar';
        style.textContent = HIDE_SIDEBAR_CSS;
        doc.head.appendChild(style);
      }
      if (!doc.getElementById('cdf-staffdeck-route-tracker')) {
        const script = doc.createElement('script');
        script.id = 'cdf-staffdeck-route-tracker';
        script.textContent = ROUTE_TRACKER_JS;
        doc.head.appendChild(script);
      }
    } catch {
      /* 跨域或未就绪：下次 onload 再试 */
    }
  };

  /** 在 iframe 内部导航到指定 StaffDeck 路由（不会触发整包重新加载） */
  const navigateIframe = (route: string) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const win = iframe.contentWindow;
    const fullPath = `/staffdeck-app${route}`;
    try {
      win.history.pushState({}, '', fullPath);
      win.dispatchEvent(new PopStateEvent('popstate'));
    } catch {
      try {
        iframe.src = `/staffdeck-app/#${route}`;
      } catch { /* ignore */ }
    }
  };

  /** 仓库模式：导航到工作区聊天 + 设置 localStorage 选中仓库专员 */
  const applyWarehouseMode = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const win = iframe.contentWindow as (Window & typeof globalThis) | null;
      if (win) {
        win.localStorage.setItem('ultrarag_enterprise_agent_scope', 'seed-agent-warehouse-specialist');
      }
    } catch { /* 跨域忽略 */ }
    navigateIframe('/workspace/chat');
  };

  // 监听主程序侧边栏的 STAFFDECK_NAVIGATE 消息 → iframe 内导航
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === STAFFDECK_NAVIGATE && event.data?.route) {
        navigateIframe(event.data.route);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // 当 warehouseMode 从 false → true 且 iframe 已加载：立即导航工作区
  useEffect(() => {
    if (warehouseMode && warehouseAppliedRef.current && iframeLoaded && iframeRef.current?.contentWindow) {
      applyWarehouseMode();
    }
  }, [warehouseMode, iframeLoaded]);

  // 冷加载兜底：超过 10s 还没有 onload → 强制切走骨架（避免一直挂骨架）
  useEffect(() => {
    if (iframeLoaded) return;
    loadTimeoutRef.current = window.setTimeout(() => {
      setIframeLoaded(true);
    }, IFRAME_LOAD_TIMEOUT_MS);
    return () => {
      if (loadTimeoutRef.current) {
        window.clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, [iframeLoaded]);

  // 侧边栏收起时，顶部避让 GlobalActionsBar 按钮组（toggle + 新建对话）
  const topOffset = sidebarCollapsed ? '50px' : 0;

  return (
    <Box
      sx={{
        position: 'absolute',
        top: sidebarCollapsed ? topOffset : 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 'auto',
        height: 'auto',
        bgcolor: '#FFFFFF',
        overflow: 'hidden',
      }}
    >
      {/*
        冷加载骨架屏（iframe onload 之前显示）：
        — 结构对齐实际员工页面 shadcn 风格：
          顶部导航条 48px (背景 #fff / 文字 #111 / 按钮)
          + 侧边栏 240px (shadcn teal: #0f766e 深色 + hover #0e7490)
          + 主内容区 卡片 + 对话列表骨架
        — 骨架与真实内容布局一致，onload 后立即用 iframe 覆盖（不需要过渡，因为结构与背景相同）
      */}
      {!iframeLoaded && <StaffDeckSkeleton />}

      <iframe
        ref={iframeRef}
        src={iframeBaseSrc}
        title="员工 StaffDeck"
        onLoad={() => {
          if (loadTimeoutRef.current) {
            window.clearTimeout(loadTimeoutRef.current);
            loadTimeoutRef.current = null;
          }
          injectSidebarHiding();
          if (warehouseMode) {
            warehouseAppliedRef.current = true;
            applyWarehouseMode();
          } else {
            warehouseAppliedRef.current = true;
          }
          setIframeLoaded(true);
        }}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          // 加载前 opacity:0（骨架在下面显示），onload 后直接 opacity:1
          // 不用 transition——因为结构与背景相同，直接覆盖即可，避免"淡入一下"再闪
          opacity: iframeLoaded ? 1 : 0,
        }}
      />
    </Box>
  );
}

/* =========================================================================
 * 冷加载骨架：与 StaffDeck 实际页面（shadcn UI）风格对齐
 *   - 顶部：48px 导航条（左logo区 + 右按钮组）
 *   - 左侧：240px 侧边栏（shadcn teal 渐变底 + 菜单项骨架）
 *   - 主体：对话搜索框 + 历史会话列表 + 右侧聊天区
 * ========================================================================= */
function StaffDeckSkeleton() {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#FFFFFF',
        overflow: 'hidden',
        // 防闪：与 iframe 背景完全一致（白背景不抖动）
      }}
    >
      {/* 顶部导航条：48px shadcn app-header */}
      <Box
        sx={{
          height: '48px',
          flex: '0 0 48px',
          display: 'flex',
          alignItems: 'center',
          px: 2,
          gap: 2,
          bgcolor: '#FFFFFF',
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        <Skeleton variant="circular" width={24} height={24} sx={{ bgcolor: '#CBD5E1' }} />
        <Skeleton variant="text" width={120} height={22} sx={{ fontSize: '1rem', borderRadius: '4px', bgcolor: '#E2E8F0' }} />
        <Box sx={{ flex: 1 }} />
        <Skeleton variant="rounded" width={80} height={30} sx={{ borderRadius: '6px', bgcolor: '#E2E8F0' }} />
        <Skeleton variant="rounded" width={30} height={30} sx={{ borderRadius: '6px', bgcolor: '#E2E8F0' }} />
      </Box>

      {/* 主体：侧边栏 + 内容区 */}
      <Box sx={{ flex: '1 1 auto', display: 'flex', minHeight: 0 }}>
        {/* 侧边栏 240px：shadcn teal 风格深色 */}
        <Box
          sx={{
            width: '240px',
            flex: '0 0 240px',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.2,
            py: 2,
            px: 1.5,
            background:
              'linear-gradient(180deg, #0F766E 0%, #0E7490 100%)',
            color: '#fff',
          }}
        >
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton
              key={i}
              variant="text"
              width={i === 6 ? '55%' : undefined}
              height={22}
              sx={{
                fontSize: '0.875rem',
                borderRadius: '6px',
                bgcolor: 'rgba(255,255,255,0.18)',
              }}
            />
          ))}
          <Box sx={{ flex: 1 }} />
          {/* 底部用户信息 */}
          <Skeleton variant="circular" width={32} height={32} sx={{ bgcolor: 'rgba(255,255,255,0.28)', alignSelf: 'flex-start' }} />
          <Skeleton variant="text" width="70%" height={18} sx={{ fontSize: '0.75rem', borderRadius: '4px', bgcolor: 'rgba(255,255,255,0.2)' }} />
        </Box>

        {/* 内容区：双栏（左侧会话列表 + 右侧聊天面板） */}
        <Box sx={{ flex: '1 1 auto', display: 'flex', minWidth: 0 }}>
          {/* 左列：会话列表 */}
          <Box
            sx={{
              width: '280px',
              flex: '0 0 280px',
              borderRight: '1px solid #E5E7EB',
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              p: 2,
            }}
          >
            <Skeleton variant="rounded" width="100%" height={34} sx={{ borderRadius: '8px', bgcolor: '#F1F5F9' }} />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Box key={i} sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
                <Skeleton variant="text" width="65%" height={16} sx={{ fontSize: '0.8rem', borderRadius: '4px', bgcolor: '#E2E8F0' }} />
                <Skeleton variant="text" width="90%" height={14} sx={{ fontSize: '0.7rem', borderRadius: '4px', bgcolor: '#F1F5F9' }} />
              </Box>
            ))}
          </Box>

          {/* 右列：聊天面板 */}
          <Box sx={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', p: 3, gap: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Skeleton variant="rounded" width={320} height={28} sx={{ borderRadius: '999px', bgcolor: '#F1F5F9' }} />
            </Box>
            {/* 对话气泡：3~5 条交替 */}
            {[0, 1, 2, 3].map((i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  justifyContent: i % 2 === 0 ? 'flex-start' : 'flex-end',
                }}
              >
                <Skeleton
                  variant="rounded"
                  width={i % 2 === 0 ? '62%' : '48%'}
                  height={i === 0 ? 60 : i === 2 ? 90 : 36}
                  sx={{
                    borderRadius: i % 2 === 0 ? '14px 14px 14px 4px' : '14px 14px 4px 14px',
                    bgcolor: i % 2 === 0 ? '#F1F5F9' : '#CCFBF1',
                  }}
                />
              </Box>
            ))}
            <Box sx={{ flex: 1 }} />
            {/* 输入框 */}
            <Skeleton variant="rounded" width="100%" height={52} sx={{ borderRadius: '14px', bgcolor: '#F1F5F9' }} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
