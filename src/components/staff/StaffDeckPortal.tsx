import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { useLocation } from 'react-router-dom';
import LoadingFallback from '../../components/Common/LoadingFallback';

/**
 * StaffDeckPortal — 员工 iframe 常驻预热容器。
 *
 * 问题：原先 /staffdeck 走 React.lazy 路由，每次进入都 remount 组件 → iframe 重建 →
 * 重新冷加载整包 /staffdeck-app/ SPA，叠加嵌入前端收到父窗口会话后的整页 reload，
 * 用户明显感知「二次加载 / 二次白屏」。
 *
 * 修复：把 iframe 提升到路由树之外常驻挂载。App 启动即加载 /staffdeck-app/ 整包，
 * 路由匹配 /staffdeck 时仅切换 display（block/none），iframe 文档始终保留在内存中，
 * 再次进入无需重新加载，点击员工瞬时显示，彻底消除二次加载。
 *
 * 性能优化（2026-08-05）：
 * - 组件挂载后通过 requestIdleCallback 在浏览器空闲时预加载 StaffDeckEmbedPage chunk，
 *   避免首次进入 /staffdeck 时才触发 dynamic import 造成延迟。
 * - 即使从未进入 /staffdeck，iframe 也会在空闲时挂载并预热 /staffdeck-app/ 整包，
 *   用户首次点击即可瞬时显示。
 *
 * 注意：iframe 始终挂载（display:none 期间浏览器仍发起资源加载并保留文档），
 * 显示态 zIndex 高于常规布局，覆盖主内容区但不遮挡侧边栏，确保用户可随时通过
 * 侧边栏导航返回首页。
 *
 * /warehouse-staff 路径同样激活本容器，并通过 iframe src 切换到工作区聊天界面，
 * 让用户直接进入仓库员工相关 agent 选择。
 */
const StaffDeckEmbedPage = lazy(() => import('../../pages/staff/StaffDeckEmbedPage'));

const ACTIVE_PATHS = ['/staffdeck', '/warehouse-staff'];
const SIDEBAR_WIDTH_EXPANDED = 260;

export default function StaffDeckPortal() {
  const location = useLocation();
  const active = ACTIVE_PATHS.includes(location.pathname);
  // 仓库员工场景：iframe 直接进入工作区聊天，用户可挑选仓库相关 agent
  const warehouseMode = location.pathname === '/warehouse-staff';

  // 跟踪侧边栏折叠状态，据此偏移 iframe 左边界，确保侧边栏不被遮挡
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('cdf-know-clow-sidebar-collapsed');
      if (saved !== null) return saved === 'true';
    } catch { /* ignore */ }
    return false;
  });

  // 预加载标志：
  // - active=true 时 立即 置为 true（确保进入员工栏目立即渲染 iframe，避免 idle 延迟导致白屏）
  // - active=false 时 仍使用 requestIdleCallback 后台预热（不影响首屏）
  const [iframePreloaded, setIframePreloaded] = useState(false);
  const iframePreloadedRef = useRef(false);
  useEffect(() => { iframePreloadedRef.current = iframePreloaded; }, [iframePreloaded]);

  useEffect(() => {
    const onSidebarState = (e: Event) => {
      setSidebarCollapsed((e as CustomEvent).detail?.collapsed ?? false);
    };
    window.addEventListener('cdf-sidebar-state', onSidebarState);
    return () => window.removeEventListener('cdf-sidebar-state', onSidebarState);
  }, []);

  // 进入员工栏目立即预加载；未进入则在空闲时预热
  // 依赖只有 [active] — 防止 iframePreloaded 变化触发 effect 重新调度/取消导致的闪烁
  useEffect(() => {
    // 用户已切换到 /staffdeck 或 /warehouse-staff —— 必须立即显示
    if (active) {
      if (!iframePreloadedRef.current) {
        iframePreloadedRef.current = true;
        setIframePreloaded(true);
      }
      return;
    }
    // 非活跃页面时，如果已经预热就什么都不做
    if (iframePreloadedRef.current) return;
    // 否则使用 requestIdleCallback 懒预热（只排一次）
    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      iframePreloadedRef.current = true;
      setIframePreloaded(true);
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof ric === 'function') {
      const id = ric(schedule, { timeout: 2000 });
      return () => {
        cancelled = true;
        const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
        if (typeof cic === 'function') cic(id);
      };
    } else {
      const t = setTimeout(schedule, 1500);
      return () => { cancelled = true; clearTimeout(t); };
    }
  }, [active]);

  // 对齐外层 main 容器：margin: 9px、border-radius: 12px、height: calc(100vh - 18px)
  // 侧边栏未收起时，左侧还要额外留出 260px sidebar + 9px 左边距 = 269px
  const left = sidebarCollapsed ? '9px' : `${9 + SIDEBAR_WIDTH_EXPANDED}px`;

  return (
    <Box
      sx={{
        position: 'fixed',
        top: '9px',
        left,
        right: '9px',
        bottom: '9px',
        zIndex: active ? 1400 : -1,
        // 预加载完成前不渲染 iframe，避免拖慢首屏
        display: active && iframePreloaded ? 'block' : 'none',
        // 员工页面专属：外层暖米色背景 + 内层白色圆角卡片区域（与其他页面视觉风格一致）
        bgcolor: '#f7f5ef',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #eeeeee',
        p: 2,
      }}
    >
      {/* 内层白色圆角面板 —— 作为 iframe 的画布（让iframe看起来嵌在一张白色卡片里） */}
      <Box sx={{
        width: '100%',
        height: '100%',
        borderRadius: '14px',
        bgcolor: '#FFFFFF',
        border: '1px solid var(--surface-muted, #E5E7EB)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {iframePreloaded && (
          <Suspense fallback={<LoadingFallback />}>
            <StaffDeckEmbedPage warehouseMode={warehouseMode} sidebarCollapsed={sidebarCollapsed} />
          </Suspense>
        )}
      </Box>
    </Box>
  );
}
