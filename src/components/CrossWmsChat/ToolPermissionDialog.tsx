/**
 * ToolPermissionDialog — 敏感工具执行权限确认弹窗
 *
 * v1.9.2: 当 AI 调用敏感工具时，弹出此弹窗询问用户是否允许执行。
 */

import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  useTheme,
  Chip,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { getGrayScale } from '../../constants/theme';

export interface ToolPermissionRequest {
  reqId: string;
  toolName: string;
  toolArgs: string;
}

interface ToolPermissionDialogProps {
  open: boolean;
  request: ToolPermissionRequest | null;
  onApprove: (reqId: string) => void;
  onDeny: (reqId: string) => void;
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

  if (!request) return null;

  let argsObj: Record<string, unknown> = {};
  try {
    argsObj = JSON.parse(request.toolArgs);
  } catch {
    argsObj = { raw: request.toolArgs };
  }

  // 工具分类和描述（v1.9.3: 适配下划线格式工具名）
  const getToolInfo = (name: string) => {
    if (name.startsWith('file_')) return { category: '文件操作', color: '#3B82F6' };
    if (name.startsWith('shell_')) return { category: '命令执行', color: '#EF4444' };
    if (name.startsWith('desktop_')) return { category: '桌面控制', color: '#F59E0B' };
    if (name.startsWith('db_')) return { category: '数据库', color: '#10B981' };
    if (name.startsWith('wms_')) return { category: '库存管理', color: '#8B5CF6' };
    return { category: '系统工具', color: '#6B7280' };
  };

  const toolInfo = getToolInfo(request.toolName);

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          bgcolor: gs.bgPanel,
          border: `1px solid ${gs.border}`,
        },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon sx={{ color: '#F59E0B', fontSize: 28 }} />
          <Typography variant="h6" sx={{ fontWeight: 600, color: gs.textPrimary }}>
            权限请求
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 0 }}>
        <Typography sx={{ color: gs.textSecondary, mb: 2, fontSize: 14 }}>
          AI 助手请求执行以下敏感操作，请确认是否允许：
        </Typography>

        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            bgcolor: isDark ? '#2A1A0A' : '#FFFBEB',
            border: `1px solid ${isDark ? '#F59E0B40' : '#FDE68A'}`,
            mb: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Chip
              label={toolInfo.category}
              size="small"
              sx={{
                bgcolor: `${toolInfo.color}20`,
                color: toolInfo.color,
                fontWeight: 600,
                fontSize: 12,
              }}
            />
            <Typography
              sx={{
                fontFamily: 'monospace',
                fontSize: 14,
                fontWeight: 600,
                color: gs.textPrimary,
              }}
            >
              {request.toolName}
            </Typography>
          </Box>

          <Typography sx={{ color: gs.textMuted, fontSize: 13, mb: 1 }}>
            参数：
          </Typography>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1.5,
              borderRadius: 1,
              bgcolor: isDark ? '#1A1A1A' : '#F3F4F6',
              color: gs.textPrimary,
              fontSize: 12,
              fontFamily: 'monospace',
              overflow: 'auto',
              maxHeight: 200,
            }}
          >
            {JSON.stringify(argsObj, null, 2)}
          </Box>
        </Box>

        <Typography sx={{ color: gs.textMuted, fontSize: 12 }}>
          提示：此操作可能对您的系统产生影响。如果您不确定，请选择"拒绝"。
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button
          onClick={() => onDeny(request.reqId)}
          variant="outlined"
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            color: gs.textMuted,
            borderColor: gs.border,
            '&:hover': { borderColor: gs.textSecondary },
          }}
        >
          拒绝
        </Button>
        <Button
          onClick={() => onApprove(request.reqId)}
          variant="contained"
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            bgcolor: '#F59E0B',
            color: '#fff',
            '&:hover': { bgcolor: '#D97706' },
          }}
        >
          允许执行
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ToolPermissionDialog;
