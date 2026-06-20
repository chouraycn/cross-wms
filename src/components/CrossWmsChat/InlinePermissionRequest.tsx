import React, { useState, useMemo } from 'react';
import { Box, Typography, IconButton, Checkbox, FormControlLabel, useTheme } from '@mui/material';
import { getGrayScale, GrayScale } from '../../constants/theme.js';
import { Message } from '../../types/chat.js';
import { formatToolArgs } from './ToolPermissionDialog.js';

interface InlinePermissionRequestProps {
  permissionRequest: NonNullable<Message['permissionRequest']>;
  onRespond: (reqId: string, approved: boolean, alwaysAllow?: boolean) => void;
}

/** 拖拽手柄图标（6点网格）— 对齐截图左侧图标 */
const DragHandleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="4" cy="3" r="1.5" fill="#9CA3AF"/><circle cx="12" cy="3" r="1.5" fill="#9CA3AF"/>
    <circle cx="4" cy="8" r="1.5" fill="#9CA3AF"/><circle cx="12" cy="8" r="1.5" fill="#9CA3AF"/>
    <circle cx="4" cy="13" r="1.5" fill="#9CA3AF"/><circle cx="12" cy="13" r="1.5" fill="#9CA3AF"/>
  </svg>
);

export const InlinePermissionRequest: React.FC<InlinePermissionRequestProps> = ({
  permissionRequest,
  onRespond,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = useMemo(() => getGrayScale(isDark), [isDark]);
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const riskLevel = permissionRequest.riskLevel || 'confirm';

  if (permissionRequest.approved !== undefined) {
    return (
      <Box
        sx={{
          mt: 1,
          px: 1.5,
          py: 0.75,
          borderRadius: '12px 12px 0 0',
          bgcolor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F5F5',
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
        }}
      >
        <Box sx={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          bgcolor: gs.textDisabled,
          flexShrink: 0,
        }} />
        <Typography sx={{ fontSize: 12.5, color: gs.textMuted, fontWeight: 500 }}>
          {permissionRequest.approved ? '已允许' : '已拒绝'}
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: gs.textDisabled, fontFamily: 'monospace', ml: 0.25 }}>
          {permissionRequest.toolName}
        </Typography>
      </Box>
    );
  }

  let argsObj: Record<string, unknown> = {};
  try {
    argsObj = JSON.parse(permissionRequest.toolArgs);
  } catch {
    argsObj = { raw: permissionRequest.toolArgs };
  }

  const formattedArgs = formatToolArgs(permissionRequest.toolName, argsObj);

  /** 下滑消失动画 — 自动拒绝（避免 AI 对话永久等待权限响应） */
  const handleCollapse = () => {
    setIsExiting(true);
    onRespond(permissionRequest.reqId, false);
    setTimeout(() => setCollapsed(true), 280);
  };

  if (collapsed) return null;

  return (
    <Box
      sx={{
        mt: 1,
        borderRadius: '12px 12px 0 0',
        bgcolor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F5F5',
        overflow: 'hidden',
        transition: isExiting ? 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.24s ease' : 'none',
        transform: isExiting ? 'translateY(100%)' : 'translateY(0)',
        opacity: isExiting ? 0 : 1,
      }}
    >
      {/* 头部栏 — 严格复刻截图：拖拽图标+标题 | 右侧三按钮 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1.75,
          py: 1,
          minHeight: 44,
          gap: 0.75,
          cursor: 'default',
        }}
      >
        {/* 左侧：拖拽手柄 + 标题 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85, flex: 1, minWidth: 0 }}>
          <DragHandleIcon />
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 500,
              color: gs.textPrimary,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {riskLevel === 'high-risk'
              ? `⚠ 高风险 · ${permissionRequest.toolName}`
              : permissionRequest.toolName}
          </Typography>
        </Box>

        {/* 右侧：收起 ↓ / 编辑 ✏️ / 删除 🗑️ */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.15, flexShrink: 0 }}>
          {/* 收起/下滑 */}
          <IconButton
            size="small"
            onClick={handleCollapse}
            title="收起"
            sx={{
              color: gs.textMuted,
              padding: '5px',
              '&:hover': { color: gs.textSecondary, bgcolor: 'transparent' },
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </IconButton>
          {/* 编辑 — 暂无功能，仅视觉 */}
          <IconButton
            size="small"
            title="编辑"
            disabled
            sx={{
              color: gs.textDisabled,
              padding: '5px',
              '&:hover': { bgcolor: 'transparent' },
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </IconButton>
          {/* 删除（拒绝） */}
          <IconButton
            size="small"
            onClick={() => onRespond(permissionRequest.reqId, false)}
            title="拒绝并移除"
            sx={{
              color: gs.textMuted,
              padding: '5px',
              '&:hover': { color: '#EF4444', bgcolor: 'transparent' },
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </IconButton>
        </Box>
      </Box>

      {/* 展开内容区：参数 + 操作 — 随容器一起下滑，由 overflow:hidden 裁剪 */}
      {(
        <>
          {/* 结构化参数 */}
          {formattedArgs.length > 0 && (
            <Box
              sx={{
                mx: 1.5,
                mb: 0.25,
                borderRadius: 1.5,
                bgcolor: isDark ? 'rgba(0,0,0,0.2)' : '#FFFFFF',
                border: `1px solid ${gs.border}`,
                overflow: 'hidden',
              }}
            >
              {formattedArgs.map((item, idx) => (
                <Box
                  key={item.label}
                  sx={{
                    display: 'flex',
                    px: 1.25,
                    py: 0.55,
                    ...(idx > 0 ? { borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6'}` } : {}),
                    alignItems: 'flex-start',
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: gs.textMuted,
                      minWidth: 56,
                      flexShrink: 0,
                      lineHeight: '18px',
                      pt: 0.1,
                    }}
                  >
                    {item.label}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 11.5,
                      fontFamily: 'monospace',
                      color: gs.textPrimary,
                      wordBreak: 'break-all',
                      lineHeight: '18px',
                      flex: 1,
                    }}
                  >
                    {item.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          {/* 底部操作栏 */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 1.5,
              py: 0.65,
              gap: 0.5,
            }}
          >
            {/* 左侧：始终允许 */}
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={alwaysAllow}
                  onChange={(e) => setAlwaysAllow(e.target.checked)}
                  sx={{ '& .MuiSvgIcon-root': { fontSize: 14 } }}
                />
              }
              label="始终允许"
              sx={{
                mr: 0,
                '& .MuiTypography-root': { fontSize: 11.5, color: gs.textDisabled },
              }}
            />

            {/* 右侧：允许执行 */}
            <Box
              onClick={() => onRespond(permissionRequest.reqId, true, alwaysAllow)}
              sx={{
                px: 1.5,
                py: 0.45,
                borderRadius: 1.5,
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                bgcolor: riskLevel === 'high-risk' ? '#EF4444' : '#F59E0B',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
                '&:hover': { bgcolor: riskLevel === 'high-risk' ? '#DC2626' : '#D97706' },
                userSelect: 'none',
              }}
            >
              允许执行
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
};
