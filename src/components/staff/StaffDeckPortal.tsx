import { lazy, Suspense } from 'react';
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
 * 注意：iframe 始终挂载（display:none 期间浏览器仍发起资源加载并保留文档），
 * 显示态 zIndex 高于常规布局，全屏覆盖员工栏目。
 *
 * /warehouse-staff 路径同样激活本容器，并通过 iframe src 切换到工作区聊天界面，
 * 让用户直接进入仓库员工相关 agent 选择。
 */
const StaffDeckEmbedPage = lazy(() => import('../../pages/staff/StaffDeckEmbedPage'));

const ACTIVE_PATHS = ['/staffdeck', '/warehouse-staff'];

export default function StaffDeckPortal() {
  const location = useLocation();
  const active = ACTIVE_PATHS.includes(location.pathname);
  // 仓库员工场景：iframe 直接进入工作区聊天，用户可挑选仓库相关 agent
  const warehouseMode = location.pathname === '/warehouse-staff';
  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: active ? 1400 : -1,
        display: active ? 'block' : 'none',
        bgcolor: '#f7f5ef',
        overflow: 'hidden',
      }}
    >
      <Suspense fallback={null}>
        <StaffDeckEmbedPage warehouseMode={warehouseMode} />
      </Suspense>
    </Box>
  );
}
