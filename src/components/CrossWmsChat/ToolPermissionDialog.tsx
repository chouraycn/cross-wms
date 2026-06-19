/**
 * ToolPermissionDialog — 敏感工具执行权限确认面板
 *
 * v2.5.0: 批量审批重写。
 * - 支持同时显示多个待审批工具
 * - "全部允许" 一键批处理
 * - "此类工具始终允许" 类别级白名单
 * - 风险等级颜色编码（confirm=橙色, high-risk=红色）
 * - 结构化参数展示
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Typography,
  Box,
  Button,
  useTheme,
  Checkbox,
  FormControlLabel,
  IconButton,
  Collapse,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ShieldIcon from '@mui/icons-material/Shield';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DoneAllIcon from '@mui/icons-material/DoneAll';
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
  requests: ToolPermissionRequest[];
  onApprove: (reqId: string, alwaysAllow?: boolean) => void;
  onDeny: (reqId: string) => void;
  onApproveAll: (alwaysAllow?: boolean) => void;
  onDenyAll: () => void;
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

/** v2.5.0: 获取工具类别前缀（用于"此类工具始终允许"） */
export function getToolCategory(toolName: string): string {
  // MCP 工具：按 server 前缀分类
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__');
    return parts.length >= 2 ? `mcp__${parts[1]}__*` : toolName;
  }
  // 内置工具：按前缀分类
  const underscoreIdx = toolName.indexOf('_');
  if (underscoreIdx > 0) {
    return `${toolName.slice(0, underscoreIdx)}_*`;
  }
  return toolName;
}

/** v2.2.1: 结构化参数展示 */
export function formatToolArgs(toolName: string, args: Record<string, unknown>): { label: string; value: string }[] {
  if (toolName === 'file_writeFile') {
    return [
      { label: '文件路径', value: String(args.path || args.filename || '') },
      { label: '操作', value: args.content ? '写入/覆盖' : '创建' },
    ];
  }
  if (toolName === 'shell_exec') {
    return [
      { label: '命令', value: String(args.command || '') },
    ];
  }
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
  // MCP 工具：智能提取关键参数
  if (toolName.startsWith('mcp__')) {
    const keyParams = ['path', 'file_path', 'url', 'title', 'name', 'text', 'content', 'session_id', 'query'];
    const items: { label: string; value: string }[] = [];
    for (const key of keyParams) {
      if (args[key] !== undefined) {
        items.push({ label: key, value: String(args[key]).slice(0, 150) });
      }
    }
    if (items.length > 0) return items;
  }
  // 默认：显示前 3 个参数
  return Object.entries(args).slice(0, 3).map(([k, v]) => ({ label: k, value: String(v).slice(0, 200) }));
}

/** 单个工具请求卡片 */
const ToolRequestItem: React.FC<{
  req: ToolPermissionRequest;
  isDark: boolean;
  gs: ReturnType<typeof getGrayScale>;
  onApprove: (reqId: string) => void;
  onDeny: (reqId: string) => void;
}> = ({ req, isDark, gs, onApprove, onDeny }) => {
  const [expanded, setExpanded] = useState(false);

  let argsObj: Record<string, unknown> = {};
  try { argsObj = JSON.parse(req.toolArgs); } catch { argsObj = { raw: req.toolArgs }; }

  const riskLevel = req.riskLevel || 'confirm';
  const effectiveLevel = riskLevel === 'auto' ? 'confirm' : riskLevel;
  const riskStyle = RISK_STYLES[effectiveLevel] || RISK_STYLES['confirm'];
  const RiskIcon = riskStyle.icon;
  const isHighRisk = riskLevel === 'high-risk';
  const formattedArgs = formatToolArgs(req.toolName, argsObj);
  const category = getToolCategory(req.toolName);

  return (
    <Box
      sx={{
        borderRadius: 1,
        border: `1px solid ${isHighRisk ? riskStyle.border : gs.border}`,
        overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
    >
      {/* 工具头部 */}
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1,
          cursor: 'pointer',
          bgcolor: isHighRisk ? riskStyle.bg : 'transparent',
          '&:hover': { bgcolor: isHighRisk ? riskStyle.bg : gs.bgHover },
        }}
      >
        <Box
          sx={{
            width: 22,
            height: 22,
            borderRadius: 0.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: riskStyle.bg,
            flexShrink: 0,
          }}
        >
          <RiskIcon sx={{ color: riskStyle.color, fontSize: 14 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: gs.textPrimary, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {req.toolName}
          </Typography>
          <Typography sx={{ fontSize: 10, color: gs.textMuted, lineHeight: 1.2 }}>
            {riskStyle.label} · {category}
          </Typography>
        </Box>
        <IconButton size="small" sx={{ p: 0.25, color: gs.textMuted }}>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 14 }} /> : <ExpandMoreIcon sx={{ fontSize: 14 }} />}
        </IconButton>
      </Box>

      {/* 展开的参数详情 */}
      <Collapse in={expanded}>
        <Box sx={{ px: 1.5, pb: 1 }}>
          <Box
            sx={{
              borderRadius: 0.5,
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
                  px: 1,
                  py: 0.5,
                  ...(idx > 0 ? { borderTop: `1px solid ${gs.border}` } : {}),
                }}
              >
                <Typography sx={{ fontSize: 10, color: gs.textMuted, minWidth: 50, flexShrink: 0, lineHeight: '16px' }}>
                  {item.label}
                </Typography>
                <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: gs.textPrimary, wordBreak: 'break-all', lineHeight: '16px', flex: 1 }}>
                  {item.value}
                </Typography>
              </Box>
            ))}
          </Box>
          {/* 单个工具的操作按钮 */}
          <Box sx={{ display: 'flex', gap: 1, mt: 0.75, justifyContent: 'flex-end' }}>
            <Button
              onClick={(e) => { e.stopPropagation(); onDeny(req.reqId); }}
              variant="text"
              size="small"
              sx={{ borderRadius: 1, textTransform: 'none', color: gs.textMuted, fontSize: 11, px: 1, minWidth: 0 }}
            >
              拒绝
            </Button>
            <Button
              onClick={(e) => { e.stopPropagation(); onApprove(req.reqId); }}
              variant="contained"
              size="small"
              sx={{
                borderRadius: 1,
                textTransform: 'none',
                bgcolor: isHighRisk ? '#EF4444' : '#F59E0B',
                color: '#fff',
                fontSize: 11,
                px: 1.5,
                minWidth: 0,
                '&:hover': { bgcolor: isHighRisk ? '#DC2626' : '#D97706' },
              }}
            >
              允许
            </Button>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
};

const ToolPermissionDialog: React.FC<ToolPermissionDialogProps> = ({
  open,
  requests,
  onApprove,
  onDeny,
  onApproveAll,
  onDenyAll,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  // v8.7: 用 transition 替代 @keyframes，WKWebView 兼容
  const [dialogEntered, setDialogEntered] = useState(false);
  useEffect(() => {
    if (!open) { setDialogEntered(false); return; }
    const raf = requestAnimationFrame(() => setDialogEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // 计算整体风险等级
  const overallRisk = useMemo(() => {
    if (requests.some(r => r.riskLevel === 'high-risk')) return 'high-risk';
    return 'confirm';
  }, [requests]);

  const riskStyle = RISK_STYLES[overallRisk] || RISK_STYLES['confirm'];
  const isHighRisk = overallRisk === 'high-risk';
  const count = requests.length;

  if (!open || count === 0) return null;

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
        // v8.7: 用 transition 替代 @keyframes（WKWebView 兼容）
        opacity: dialogEntered ? 1 : 0,
        transform: dialogEntered ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        maxHeight: '50vh',
        display: 'flex',
        flexDirection: 'column',
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

      {/* 头部 */}
      <Box sx={{ px: 2, pt: 1.5, pb: 1, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
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
            <ShieldIcon sx={{ color: riskStyle.color, fontSize: 18 }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: gs.textPrimary, lineHeight: 1.3 }}>
              {count > 1 ? `${count} 个工具请求授权` : riskStyle.label}
            </Typography>
            <Typography sx={{ fontSize: 11, color: gs.textMuted, lineHeight: 1.3 }}>
              {isHighRisk ? '包含高风险操作，请仔细确认' : '确认后工具将自动执行'}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* 工具列表（可滚动） */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, pb: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {requests.map(req => (
          <ToolRequestItem
            key={req.reqId}
            req={req}
            isDark={isDark}
            gs={gs}
            onApprove={onApprove}
            onDeny={onDeny}
          />
        ))}
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
          flexShrink: 0,
          bgcolor: isDark ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.02)',
        }}
      >
        <Button
          onClick={onDenyAll}
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
          全部拒绝
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
            onClick={() => onApproveAll(alwaysAllow)}
            variant="contained"
            size="small"
            startIcon={<DoneAllIcon sx={{ fontSize: 14 }} />}
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
            全部允许
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default ToolPermissionDialog;
