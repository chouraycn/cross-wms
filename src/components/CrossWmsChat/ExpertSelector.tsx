/**
 * ExpertSelector.tsx
 * 专家选择弹窗 — 点击输入框"专家"药丸按钮触发
 * 样式严格参考截图设计：左侧头像+名称，右侧状态标签+描述
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Modal,
  Fade,
  Avatar,
  Chip,
  Button,
  CircularProgress,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getGrayScale } from '../../constants/theme.js';

export interface ExpertOption {
  id: string;
  name: string;
  role: string;
  description: string;
  status: 'idle' | 'busy' | 'offline';
  avatarUrl?: string;
  isDefault?: boolean;
}

interface ExpertSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (expert: ExpertOption) => void;
  selectedId?: string;
}

export const ExpertSelector: React.FC<ExpertSelectorProps> = ({
  open,
  onClose,
  onSelect,
  selectedId,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [experts, setExperts] = useState<ExpertOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExperts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // 后端返回 { data: AgentProfile[] }，映射为 ExpertOption
      const list: ExpertOption[] = (json.data || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        description: a.description || a.capabilities?.map((c: any) => c.description).join('、') || '智能助手',
        status: a.status === 'idle' ? 'idle' : a.status === 'busy' ? 'busy' : 'offline',
        isDefault: a.id === 'orchestrator',
      }));
      setExperts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchExperts();
  }, [open, fetchExperts]);

  const statusConfig = {
    idle: { label: '空闲', color: '#10B981', bg: '#ECFDF5' },
    busy: { label: '忙碌', color: '#F59E0B', bg: '#FFFBEB' },
    offline: { label: '离线', color: '#9CA3AF', bg: '#F3F4F6' },
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAfterTransition
      slotProps={{
        backdrop: {
          sx: { bgcolor: 'rgba(0,0,0,0.35)' },
        },
      }}
    >
      <Fade in={open}>
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 520,
            maxWidth: '90vw',
            maxHeight: '70vh',
            bgcolor: '#FFFFFF',
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              px: 3,
              py: 2.5,
              borderBottom: '1px solid #F3F4F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box>
              <Typography sx={{ fontSize: 17, fontWeight: 700, color: '#1F2937', lineHeight: 1.3 }}>
                选择专家
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: '#9CA3AF', mt: 0.5 }}>
                选择一位 AI 专家来协助您完成任务
              </Typography>
            </Box>
            <Box
              onClick={onClose}
              sx={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#9CA3AF',
                transition: 'all 0.15s ease',
                '&:hover': { bgcolor: '#F3F4F6', color: '#6B7280' },
              }}
            >
              <CloseIcon sx={{ fontSize: 20 }} />
            </Box>
          </Box>

          {/* Expert List */}
          <Box sx={{ flex: 1, overflow: 'auto', py: 1 }}>
            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress size={28} sx={{ color: '#7C3AED' }} />
              </Box>
            )}

            {error && (
              <Box sx={{ px: 3, py: 4, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 13, color: '#EF4444' }}>
                  加载专家列表失败：{error}
                </Typography>
                <Button
                  onClick={fetchExperts}
                  sx={{ mt: 1.5, fontSize: 13, color: '#7C3AED', textTransform: 'none' }}
                >
                  重试
                </Button>
              </Box>
            )}

            {!loading && !error && experts.map((expert) => {
              const isSelected = selectedId === expert.id;
              const status = statusConfig[expert.status];

              return (
                <Box
                  key={expert.id}
                  onClick={() => {
                    onSelect(expert);
                    onClose();
                  }}
                  sx={{
                    mx: 1.5,
                    px: 2.5,
                    py: 2,
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: isSelected ? '1.5px solid #7C3AED' : '1.5px solid transparent',
                    bgcolor: isSelected ? '#FAF5FF' : 'transparent',
                    '&:hover': {
                      bgcolor: isSelected ? '#FAF5FF' : '#F9FAFB',
                    },
                  }}
                >
                  {/* Avatar */}
                  <Avatar
                    src={expert.avatarUrl}
                    sx={{
                      width: 44,
                      height: 44,
                      bgcolor: isSelected ? '#7C3AED' : '#E5E7EB',
                      color: isSelected ? '#FFFFFF' : '#6B7280',
                      fontSize: 18,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {expert.name.charAt(0)}
                  </Avatar>

                  {/* Info */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography
                        sx={{
                          fontSize: 14.5,
                          fontWeight: 600,
                          color: isSelected ? '#7C3AED' : '#1F2937',
                          lineHeight: 1.3,
                        }}
                      >
                        {expert.name}
                      </Typography>
                      {expert.isDefault && (
                        <Chip
                          size="small"
                          label="默认"
                          sx={{
                            height: 18,
                            fontSize: 10,
                            fontWeight: 600,
                            bgcolor: '#EDE9FE',
                            color: '#7C3AED',
                            '& .MuiChip-label': { px: 0.75 },
                          }}
                        />
                      )}
                    </Box>
                    <Typography
                      sx={{
                        fontSize: 12.5,
                        color: '#6B7280',
                        lineHeight: 1.4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {expert.description}
                    </Typography>
                  </Box>

                  {/* Right side: status + check */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
                    <Chip
                      size="small"
                      label={status.label}
                      sx={{
                        height: 22,
                        fontSize: 11,
                        fontWeight: 500,
                        bgcolor: status.bg,
                        color: status.color,
                        border: 'none',
                        '& .MuiChip-label': { px: 1 },
                      }}
                    />
                    {isSelected && (
                      <CheckCircleIcon sx={{ fontSize: 20, color: '#7C3AED' }} />
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>

          {/* Footer */}
          <Box
            sx={{
              px: 3,
              py: 2,
              borderTop: '1px solid #F3F4F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography sx={{ fontSize: 12, color: '#9CA3AF' }}>
              共 {experts.length} 位专家
            </Typography>
            <Button
              onClick={onClose}
              sx={{
                fontSize: 13,
                color: '#6B7280',
                textTransform: 'none',
                px: 2,
                py: 0.75,
                borderRadius: '8px',
                '&:hover': { bgcolor: '#F3F4F6' },
              }}
            >
              取消
            </Button>
          </Box>
        </Box>
      </Fade>
    </Modal>
  );
};
