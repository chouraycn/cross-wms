/**
 * ModelBatchToolbar — 批量操作工具栏
 *
 * 当选中多个模型时显示，提供批量启用/禁用/删除操作
 */

import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { COLORS } from './styles';

interface ModelBatchToolbarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onBatchEnable: () => void;
  onBatchDisable: () => void;
  onBatchDelete: () => void;
}

const ModelBatchToolbar: React.FC<ModelBatchToolbarProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onBatchEnable,
  onBatchDisable,
  onBatchDelete,
}) => {
  const allSelected = selectedCount === totalCount;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        py: 1,
        backgroundColor: '#EFF6FF',
        borderBottom: `1px solid ${COLORS.borderLight}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          size="small"
          startIcon={allSelected ? <CheckBoxIcon sx={{ fontSize: 18 }} /> : <CheckBoxOutlineBlankIcon sx={{ fontSize: 18 }} />}
          onClick={onSelectAll}
          sx={{ fontSize: '0.75rem', color: COLORS.textSecondary, textTransform: 'none' }}
        >
          {allSelected ? '取消全选' : '全选'}
        </Button>
        <Typography sx={{ fontSize: '0.75rem', color: COLORS.textMuted }}>
          已选中 <strong>{selectedCount}</strong> 个模型
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 0.75 }}>
        <Button
          size="small"
          startIcon={<PlayArrowIcon sx={{ fontSize: 16 }} />}
          onClick={onBatchEnable}
          sx={{
            fontSize: '0.7rem',
            textTransform: 'none',
            color: COLORS.success,
            borderColor: COLORS.success,
            '&:hover': { backgroundColor: COLORS.successBg },
          }}
          variant="outlined"
        >
          启用
        </Button>
        <Button
          size="small"
          startIcon={<PauseIcon sx={{ fontSize: 16 }} />}
          onClick={onBatchDisable}
          sx={{
            fontSize: '0.7rem',
            textTransform: 'none',
            color: COLORS.textMuted,
            borderColor: COLORS.border,
            '&:hover': { backgroundColor: '#F3F4F6' },
          }}
          variant="outlined"
        >
          禁用
        </Button>
        <Button
          size="small"
          startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
          onClick={onBatchDelete}
          sx={{
            fontSize: '0.7rem',
            textTransform: 'none',
            color: COLORS.error,
            borderColor: COLORS.error,
            '&:hover': { backgroundColor: COLORS.errorBg },
          }}
          variant="outlined"
        >
          删除
        </Button>
      </Box>
    </Box>
  );
};

export default ModelBatchToolbar;
