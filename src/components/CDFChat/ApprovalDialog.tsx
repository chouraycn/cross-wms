import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  List,
  ListItem,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SecurityIcon from '@mui/icons-material/Security';

export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalRequest {
  id: string;
  toolName: string;
  toolDescription?: string;
  parameters: Record<string, unknown>;
  riskLevel: RiskLevel;
  reason?: string;
  timestamp: number;
  messageId?: string;
}

interface ApprovalDialogProps {
  open: boolean;
  requests: ApprovalRequest[];
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
  onApproveAll?: () => void;
  onRejectAll?: () => void;
  onClose?: () => void;
  darkMode?: boolean;
}

const riskLevelConfig: Record<RiskLevel, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  safe: {
    label: '安全',
    color: '#16A34A',
    bgColor: 'rgba(22, 163, 74, 0.1)',
    icon: <CheckCircleIcon sx={{ fontSize: 20 }} />,
  },
  low: {
    label: '低风险',
    color: '#3B82F6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    icon: <InfoIcon sx={{ fontSize: 20 }} />,
  },
  medium: {
    label: '中风险',
    color: '#EAB308',
    bgColor: 'rgba(234, 179, 8, 0.1)',
    icon: <WarningAmberIcon sx={{ fontSize: 20 }} />,
  },
  high: {
    label: '高风险',
    color: '#F97316',
    bgColor: 'rgba(249, 115, 22, 0.1)',
    icon: <ErrorIcon sx={{ fontSize: 20 }} />,
  },
  critical: {
    label: '严重风险',
    color: '#EF4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: <ErrorIcon sx={{ fontSize: 20 }} />,
  },
};

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatParams = (params: Record<string, unknown>): string => {
  try {
    return JSON.stringify(params, null, 2);
  } catch {
    return String(params);
  }
};

export const ApprovalDialog: React.FC<ApprovalDialogProps> = ({
  open,
  requests,
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
  onClose,
  darkMode = false,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentRequest = useMemo(() => {
    return requests[currentIndex] || null;
  }, [requests, currentIndex]);

  const handlePrev = () => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex(prev => Math.min(requests.length - 1, prev + 1));
  };

  const handleApprove = () => {
    if (currentRequest) {
      onApprove(currentRequest.id);
      if (requests.length <= 1) {
        onClose?.();
      } else {
          setCurrentIndex(prev => Math.min(prev, requests.length - 2));
        }
    }
  };

  const handleReject = () => {
    if (currentRequest) {
      onReject(currentRequest.id);
      if (requests.length <= 1) {
        onClose?.();
      } else {
        setCurrentIndex(prev => Math.min(prev, requests.length - 2));
      }
    }
  };

  const riskConfig = currentRequest ? riskLevelConfig[currentRequest.riskLevel] : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: darkMode ? '#1A1A1A' : '#FFFFFF',
          color: darkMode ? '#F3F4F6' : '#111827',
        },
      }}
    >
      <DialogTitle
        sx={{
          textAlign: 'center',
          pt: 3,
          pb: 2,
          borderBottom: 1,
          borderColor: darkMode ? '#333' : '#E5E7EB',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <SecurityIcon sx={{ color: '#F97316' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            工具调用审批
          </Typography>
        </Box>
        {requests.length > 1 && (
          <Typography variant="body2" sx={{ color: darkMode ? '#9CA3AF' : '#6B7280', mt: 0.5 }}>
            {currentIndex + 1} / {requests.length} 个待审批请求
          </Typography>
        )}
      </DialogTitle>

      <DialogContent sx={{ pt: 2, pb: 2 }}>
        {currentRequest && riskConfig && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2,
                  py: 1,
                  borderRadius: 2,
                  bgcolor: riskConfig.bgColor,
                  color: riskConfig.color,
                }}
              >
                {riskConfig.icon}
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {riskConfig.label}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: darkMode ? '#9CA3AF' : '#6B7280', ml: 'auto' }}>
                {formatTime(currentRequest.timestamp)}
              </Typography>
            </Box>

            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
              {currentRequest.toolName}
            </Typography>

            {currentRequest.toolDescription && (
              <Typography variant="body2" sx={{ color: darkMode ? '#9CA3AF' : '#6B7280', mb: 2 }}>
                {currentRequest.toolDescription}
              </Typography>
            )}

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              调用参数
            </Typography>
            <Box
              sx={{
                bgcolor: darkMode ? '#252525' : '#F3F4F6',
                borderRadius: 2,
                p: 2,
                mb: 2,
                maxHeight: 200,
                overflow: 'auto',
              }}
            >
              <pre
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontFamily: 'JetBrains Mono, Fira Code, monospace',
                  color: darkMode ? '#E5E7EB' : '#374151',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {formatParams(currentRequest.parameters)}
              </pre>
            </Box>

            {currentRequest.reason && (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  风险说明
                </Typography>
                <Box
                  sx={{
                    bgcolor: riskConfig.bgColor,
                    border: 1,
                    borderColor: riskConfig.color,
                    borderRadius: 2,
                    p: 2,
                  }}
                >
                  <Typography variant="body2" sx={{ color: riskConfig.color }}>
                    {currentRequest.reason}
                  </Typography>
                </Box>
              </>
            )}
          </Box>
        )}

        {requests.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircleIcon sx={{ fontSize: 48, color: '#16A34A', mb: 2 }} />
            <Typography variant="h6">暂无待审批请求</Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          justifyContent: 'space-between',
          px: 3,
          pb: 2,
          borderTop: 1,
          borderColor: darkMode ? '#333' : '#E5E7EB',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1 }}>
          {requests.length > 1 && (
            <>
              <Tooltip title="上一个">
                <span>
                  <IconButton
                    onClick={handlePrev}
                    disabled={currentIndex === 0}
                    size="small"
                    sx={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}
                  >
                    <ChevronLeftIcon />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="下一个">
                <span>
                  <IconButton
                    onClick={handleNext}
                    disabled={currentIndex === requests.length - 1}
                    size="small"
                    sx={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}
                  >
                    <ChevronRightIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {requests.length > 1 && (
            <>
              <Button
                variant="outlined"
                size="small"
                onClick={onRejectAll}
                color="error"
              >
                全部拒绝
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={onApproveAll}
                color="success"
              >
                全部批准
              </Button>
            </>
          )}
          <Button
            variant="outlined"
            onClick={handleReject}
            color="error"
            startIcon={<CancelIcon />}
            disabled={!currentRequest}
          >
            拒绝
          </Button>
          <Button
            variant="contained"
            onClick={handleApprove}
            color="success"
            startIcon={<CheckCircleIcon />}
            disabled={!currentRequest}
          >
            批准
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default ApprovalDialog;
