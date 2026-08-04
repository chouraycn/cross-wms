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
 * warehouseMode：仓库员工场景下 iframe 直接打开 /staffdeck-app/#/workspace/chat，
 * 让用户进入工作区聊天界面选择仓库相关 agent；默认场景下打开 /staffdeck-app/ 入口。
 */
const STAFFDECK_MSG_REQUEST_AUTH = 'STAFFDECK_REQUEST_AUTH';
const STAFFDECK_MSG_AUTH = 'STAFFDECK_AUTH';

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

  useEffect(() => {
    // 确保本地有默认会话（同源时 iframe 可直接读到；也用于下发）
    ensureDefaultSession();

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== STAFFDECK_MSG_REQUEST_AUTH) return;
      // iframe 请求会话 → 下发当前/默认会话
      pushSessionToIframe();
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
        onLoad={pushSessionToIframe}
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
