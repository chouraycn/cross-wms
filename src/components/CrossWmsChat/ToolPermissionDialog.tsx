/**
 * ToolPermissionDialog — 敏感工具执行权限确认弹窗
 *
 * v2.3.0: 重写，对标 Trae 设计。
 * - 非 Dialog，而是覆盖在输入框上方的浮动面板（不遮挡对话内容）
 * - 风险等级颜色编码（confirm=橙色, high-risk=红色）
 * - 结构化参数展示（替代 JSON.stringify）
 * - Always Allow 复选框
 */

import React, { useState } from 'react';
import {
  Typography,
  Box,
  Button,
  useTheme,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ShieldIcon from '@mui/icons-material/Shield';
import { getGrayScale } from '../../constants/theme';

export interface ToolPermissionRequest {
  reqId: string;
  toolName: string;
  toolArgs: string;
  /** v2.2.1: 风险等级 */
  riskLevel?: 'auto' | 'confirm' | 'high-risk';
}

interface ToolPermissionDialogProps {
  open: boolean;
  request: ToolPermissionRequest | null;
  onApprove: (reqId: string, alwaysAllow?: boolean) => void;
  onDeny: (reqId: string) => void;
}

/** v2.2.1: 风险等级样式映射 */
const RISK_STYLES = {
  'confirm': {
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.2)',
    label: '需要确认',
    icon: WarningAmberIcon,
  },
  'high-risk': {
    color: '#EF4444',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.2)',
    label: '高风险操作',
    icon: ErrorOutlineIcon,
  },
};

/** v2.2.1: 结构化参数展示 — 根据工具名提取关键参数，人性化展示 */
export function formatToolArgs(toolName: string, args: Record<string, unknown>): { label: string; value: string }[] {
  // file_writeFile: 显示文件路径 + 操作类型
  if (toolName === 'file_writeFile') {
    return [
      { label: '文件路径', value: String(args.path || args.filename || '') },
      { label: '操作', value: args.content ? '写入/覆盖' : '创建' },
    ];
  }
  // shell_exec: 显示命令
  if (toolName === 'shell_exec') {
    return [
      { label: '命令', value: String(args.command || '') },
    ];
  }
  // desktop_*: 显示操作类型 + 目标
  if (toolName.startsWith('desktop_')) {
    const items: { label: string; value: string }[] = [
      { label: '操作', value: toolName.replace('desktop_', '') },
    ];
    if (args.app) items.push({ label: '目标应用', value: String(args.app) });
    if (args.button) items.push({ label: '按钮', value: String(args.button) });
    if (args.text) items.push({ label: '输入文本', value: String(args.text).slice(0, 100) });
    if (args.key) items.push({ label: '按键', value: String(args.key) });
    return items;
  }
  // 默认：显示所有参数
  return Object.entries(args).map(([k, v]) => ({ label: k, value: String(v).slice(0, 200) }));
}

const ToolPermissionDialog: React.FC<ToolPermissionDialogProps> = ({
  open,
  request,
  onApprove,
  onDeny,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [alwaysAllow, setAlwaysAllow] = useState(false);

  if (!open || !request) return null;

  let argsObj: Record<string, unknown> = {};
  try {
    argsObj = JSON.parse(request.toolArgs);
  } catch {
    argsObj = { raw: request.toolArgs };
  }

  // 根据风险等级获取样式，auto 和 confirm 均使用 confirm 样式
  const riskLevel = request.riskLevel || 'confirm';
  const effectiveLevel = riskLevel === 'auto' ? 'confirm' : riskLevel;
  const riskStyle = RISK_STYLES[effectiveLevel] || RISK_STYLES['confirm'];
  const RiskIcon = riskStyle.icon;
  const isHighRisk = riskLevel === 'high-risk';

  // 结构化参数
  const formattedArgs = formatToolArgs(request.toolName, argsObj);

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        mb: 1,
        zIndex: 1300,
        borderRadius: 2,
        bgcolor: gs.bgPanel,
        border: isHighRisk
          ? `1.5px solid ${riskStyle.border}`
          : `1px solid ${gs.border}`,
        boxShadow: isDark
          ? '0 -4px 24px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.05)'
          : '0 -4px 24px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.05)',
        overflow: 'hidden',
        animation: 'permissionSlideUp 0.25s cubic-bezier(0.4,0,0.2,1)',
        '@keyframes permissionSlideUp': {
          from: { opacity: 0, transform: 'translateY(12px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      {/* 顶部渐变条 */}
      <Box
        sx={{
          height: 3,
          background: isHighRisk
            ? 'linear-gradient(90deg, #EF4444, #F87171)'
            : 'linear-gradient(90deg, #F59E0B, #FBBF24)',
        }}
      />

      {/* 头部：图标 + 标签 + 工具名 */}
      <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: riskStyle.bg,
            }}
          >
            <RiskIcon sx={{ color: riskStyle.color, fontSize: 18 }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: gs.textPrimary, lineHeight: 1.3 }}>
              {riskStyle.label}
            </Typography>
            <Typography
              sx={{
                fontSize: 11,
                fontFamily: 'monospace',
                color: gs.textMuted,
                lineHeight: 1.3,
              }}
            >
              {request.toolName}
            </Typography>
          </Box>
          <ShieldIcon sx={{ fontSize: 14, color: gs.textDisabled, opacity: 0.5 }} />
        </Box>

        {/* 高风险提示 */}
        {isHighRisk && (
          <Box
            sx={{
              p: 1,
              borderRadius: 1,
              bgcolor: riskStyle.bg,
              border: `1px solid ${riskStyle.border}`,
              mb: 1,
            }}
          >
            <Typography sx={{ fontSize: 11, color: riskStyle.color, fontWeight: 500 }}>
              此操作可能对系统产生不可逆的影响，请仔细确认后再执行。
            </Typography>
          </Box>
        )}

        {/* 结构化参数列表 */}
        <Box
          sx={{
            borderRadius: 1,
            bgcolor: isDark ? 'rgba(0,0,0,0.2)' : '#F3F4F6',
            border: `1px solid ${gs.border}`,
            overflow: 'hidden',
          }}
        >
          {formattedArgs.map((item, idx) => (
            <Box
              key={item.label}
              sx={{
                display: 'flex',
                px: 1.5,
                py: 0.75,
                ...(idx > 0 ? { borderTop: `1px solid ${gs.border}` } : {}),
              }}
            >
              <Typography
                sx={{
                  fontSize: 11,
                  color: gs.textMuted,
                  minWidth: 60,
                  flexShrink: 0,
                  lineHeight: '18px',
                }}
              >
                {item.label}
              </Typography>
              <Typography
                sx={{
                  fontSize: 11,
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
      </Box>

      {/* 底部操作栏 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          borderTop: `1px solid ${gs.border}`,
          gap: 1,
        }}
      >
        <Button
          onClick={() => onDeny(request.reqId)}
          variant="text"
          size="small"
          sx={{
            borderRadius: 1.5,
            textTransform: 'none',
            color: gs.textMuted,
            fontSize: 12,
            px: 1.5,
            '&:hover': { color: gs.textSecondary, bgcolor: 'rgba(0,0,0,0.04)' },
          }}
        >
          拒绝
        </Button>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
              '& .MuiTypography-root': { fontSize: 11, color: gs.textMuted },
            }}
          />
          <Button
            onClick={() => onApprove(request.reqId, alwaysAllow)}
            variant="contained"
            size="small"
            sx={{
              borderRadius: 1.5,
              textTransform: 'none',
              bgcolor: isHighRisk ? '#EF4444' : '#F59E0B',
              color: '#fff',
              fontSize: 12,
              px: 2,
              '&:hover': { bgcolor: isHighRisk ? '#DC2626' : '#D97706' },
            }}
          >
            允许执行
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default ToolPermissionDialog;
