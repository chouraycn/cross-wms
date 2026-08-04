import { lazy, Suspense } from 'react';
import { Box } from '@mui/material';
import { useLocation } from 'react-router-dom';
import LoadingFallback from '../../components/Common/LoadingFallback';

/**
 * StaffDeckPortal — 数字员工 iframe 常驻预热容器。
 *
 * 问题：原先 /staffdeck 走 React.lazy 路由，每次进入都 remount 组件 → iframe 重建 →
 * 重新冷加载整包 /staffdeck-app/ SPA，叠加嵌入前端收到父窗口会话后的整页 reload，
 * 用户明显感知「二次加载 / 二次白屏」。
 *
 * 修复：把 iframe 提升到路由树之外常驻挂载。App 启动即加载 /staffdeck-app/ 整包，
 * 路由匹配 /staffdeck 时仅切换 display（block/none），iframe 文档始终保留在内存中，
 * 再次进入无需重新加载，点击数字员工瞬时显示，彻底消除二次加载。
 *
 * 注意：iframe 始终挂载（display:none 期间浏览器仍发起资源加载并保留文档），
 * 显示态 zIndex 高于常规布局，全屏覆盖数字员工栏目。
 */
const StaffDeckEmbedPage = lazy(() => import('../../pages/staff/StaffDeckEmbedPage'));

export default function StaffDeckPortal() {
  const location = useLocation();
  const active = location.pathname === '/staffdeck';
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
        <StaffDeckEmbedPage />
      </Suspense>
    </Box>
  );
}
