import { Suspense, useState, useEffect, useRef, useMemo } from 'react';
import { Box } from '@mui/material';
import { useLocation } from 'react-router-dom';
import StaffDeckEmbedPage from '../../pages/staff/StaffDeckEmbedPage';

/**
 * StaffDeckPortal — 员工 iframe 常驻预热容器。
 *
 * 防闪屏设计原则：
 * 1) iframe 容器一旦挂载永远不 unmount，display 永远 block，靠 opacity 平滑显隐。
 *    — display:none 会让 Chromium 暂停解码，下次显示需要重新合成（容易白屏一帧）；
 *    — 条件渲染 {xxx && <Iframe/>} 会导致 iframe 文档整包重建，等于每次进入都冷加载。
 * 2) zIndex 固定高值，不在 -1/1400 间切换（层级跳变会产生半透明残影合成）。
 *    — 非活跃期靠 opacity:0 + pointer-events:none 让点击穿透到下层 main 内容。
 *    — 不使用 visibility 属性：visibility 无法用 ease 过渡，只能离散 0s，
 *      在 active=false 淡出期间 visibility 立即 hidden 会导致「刚淡出到一半就突然消失」的闪。
 *      opacity=0 已经是独立合成层，肉眼与 visibility:hidden 效果一致。
 * 3) 去掉 React.lazy 动态 import：StaffDeckEmbedPage 本身是薄包装，直接静态 import。
 *    — 避免每次第一次都走 Suspense fallback（转圈 spinner）再突变为 iframe。
 * 4) 侧边栏折叠变化给左边界加 120ms 过渡，不要瞬间位移（视觉上"抖一下"）。
 * 5) 切换 /warehouse-staff 与 /staffdeck 时，不通过改 iframe.src （会整包重载），
 *    — 而是调用内部 navigateIframe 用 history.pushState + popstate 导航。
 */

const ACTIVE_PATHS = ['/staffdeck', '/warehouse-staff'];
const SIDEBAR_WIDTH_EXPANDED = 260;

export default function StaffDeckPortal() {
  const location = useLocation();
  const active = ACTIVE_PATHS.includes(location.pathname);
  const warehouseMode = location.pathname === '/warehouse-staff';

  // ====== 侧边栏折叠状态 ======
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('cdf-know-clow-sidebar-collapsed');
      if (saved !== null) return saved === 'true';
    } catch { /* ignore */ }
    return false;
  });

  useEffect(() => {
    const onSidebarState = (e: Event) => {
      setSidebarCollapsed((e as CustomEvent).detail?.collapsed ?? false);
    };
    window.addEventListener('cdf-sidebar-state', onSidebarState);
    return () => window.removeEventListener('cdf-sidebar-state', onSidebarState);
  }, []);

  // 对齐外层 main 容器：margin: 9px、border-radius: 12px、height: calc(100vh - 18px)
  // 侧边栏未收起时，左侧还要额外留出 260px sidebar + 9px 左边距 = 269px
  const left = useMemo(
    () => (sidebarCollapsed ? '9px' : `${9 + SIDEBAR_WIDTH_EXPANDED}px`),
    [sidebarCollapsed],
  );

  return (
    <Box
      sx={{
        position: 'fixed',
        top: '9px',
        left,
        right: '9px',
        bottom: '9px',
        // zIndex 固定：不再 -1 / 1400 切换（层级跳变会产生合成残影）
        zIndex: 1400,
        // 常驻 display:block，靠 opacity + pointerEvents 控制显隐
        display: 'block',
        // 非活跃：opacity=0（合成层保留，切换时淡入淡出，无白板闪）
        // 活跃：opacity=1
        opacity: active ? 1 : 0,
        // 指针事件：活跃期才能接收点击，非活跃期让点击穿透到下层 main
        pointerEvents: active ? 'auto' : 'none',
        // 过渡：120ms 极短淡入，不拖沓但足够避免"突然出现"的闪
        // 注意：不把 visibility 加进 transition（visibility 只能离散过渡，会破坏淡出连续性）
        transition: 'opacity 120ms ease, left 120ms cubic-bezier(0.4, 0, 0.2, 1)',
        willChange: 'opacity, left',
        bgcolor: '#FFFFFF',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #E5E7EB',
      }}
    >
      {/*
        不再条件渲染 {iframePreloaded && ...}
        iframe 容器永远存在 → 文档不重建 → 切换瞬时显示
        Suspense fallback 为 null（不显示 spinner，保持统一白底过渡，
        因为 iframe 本身冷加载期间外层已经是白底，spinner 反而会多闪一次）
      */}
      <Suspense fallback={null}>
        <StaffDeckEmbedPage warehouseMode={warehouseMode} sidebarCollapsed={sidebarCollapsed} />
      </Suspense>
    </Box>
  );
}
