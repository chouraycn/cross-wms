/**
 * ModelBatchToolbar — 批量操作工具栏
 *
 * 当选中多个模型时显示，提供批量启用/禁用/删除操作
 */

import React from 'react';
import { Box, Button, Typography, useTheme } from '@mui/material';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { getModelManagerStyles } from './styles';

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
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const styles = getModelManagerStyles(isDark);
  const allSelected = selectedCount === totalCount;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        py: 1,
        backgroundColor: styles.semantic.infoBg,
        borderBottom: `1px solid ${styles.borderLight}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          size="small"
          startIcon={allSelected ? <CheckBoxIcon sx={{ fontSize: 18 }} /> : <CheckBoxOutlineBlankIcon sx={{ fontSize: 18 }} />}
          onClick={onSelectAll}
          sx={{ fontSize: '0.75rem', color: styles.textSecondary, textTransform: 'none' }}
        >
          {allSelected ? '取消全选' : '全选'}
        </Button>
        <Typography sx={{ fontSize: '0.75rem', color: styles.textMuted }}>
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
            color: styles.semantic.success,
            borderColor: styles.semantic.successBorder,
            '&:hover': { backgroundColor: isDark ? 'rgba(52, 211, 153, 0.1)' : styles.semantic.successBg },
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
            color: styles.textMuted,
            borderColor: styles.border,
            '&:hover': { backgroundColor: styles.bgHover },
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
            color: styles.semantic.error,
            borderColor: styles.semantic.errorBorder,
            '&:hover': { backgroundColor: isDark ? 'rgba(248, 113, 113, 0.1)' : styles.semantic.errorBg },
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
