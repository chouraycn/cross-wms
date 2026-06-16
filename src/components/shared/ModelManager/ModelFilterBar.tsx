/**
 * ModelFilterBar — 模型筛选栏（紧凑版）
 *
 * 布局策略：
 * - 搜索框和能力标签放在同一行，不换行
 * - 能力标签缩小为更紧凑的样式
 * - 超出宽度时能力标签区域可横向滚动
 */

import React from 'react';
import { Box, TextField, Chip, IconButton, InputAdornment, useTheme } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { CAPABILITY_LABELS, CAPABILITY_COLORS, type ModelCapability } from '../../../types/models';
import { getModelManagerStyles } from './styles';

interface ModelFilterBarProps {
  searchQuery: string;
  selectedCapabilities: string[];
  onSearchChange: (query: string) => void;
  onCapabilityToggle: (cap: string) => void;
  onClearFilters: () => void;
}

const ALL_CAPABILITIES: ModelCapability[] = ['code', 'longContext', 'reasoning', 'multimodal', 'fast', 'costEffective', 'general'];

const ModelFilterBar: React.FC<ModelFilterBarProps> = ({
  searchQuery,
  selectedCapabilities,
  onSearchChange,
  onCapabilityToggle,
  onClearFilters,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const styles = getModelManagerStyles(isDark);
  const hasFilters = searchQuery || selectedCapabilities.length > 0;

  return (
    <Box sx={{ px: 0, py: 1.5 }}>
      {/* 单行布局：搜索框 + 能力标签，不换行 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'nowrap' }}>
        {/* 搜索框 - 固定宽度 */}
        <TextField
          size="small"
          placeholder="搜索模型..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          sx={{
            width: 160,
            flexShrink: 0,
            '& .MuiOutlinedInput-root': {
              borderRadius: 1.5,
              backgroundColor: styles.bgInput,
              height: 30,
              fontSize: '0.75rem',
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 14, color: styles.textMuted }} />
              </InputAdornment>
            ),
            endAdornment: searchQuery ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => onSearchChange('')} sx={{ p: 0.1 }}>
                  <ClearIcon sx={{ fontSize: 12, color: styles.textMuted }} />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
        />

        {/* 分隔线 */}
        <Box sx={{ width: '1px', height: 18, backgroundColor: styles.borderLight, flexShrink: 0 }} />

        {/* 能力标签 - 紧凑样式，不换行，超出可滚动 */}
        <Box
          sx={{
            display: 'flex',
            gap: 0.4,
            alignItems: 'center',
            flex: 1,
            overflow: 'auto',
            '&::-webkit-scrollbar': { display: 'none' },
            scrollbarWidth: 'none',
          }}
        >
          {ALL_CAPABILITIES.map(cap => {
            const selected = selectedCapabilities.includes(cap);
            return (
              <Chip
                key={cap}
                label={CAPABILITY_LABELS[cap]}
                size="small"
                onClick={() => onCapabilityToggle(cap)}
                sx={{
                  fontSize: '0.6rem',
                  height: 20,
                  cursor: 'pointer',
                  flexShrink: 0,
                  backgroundColor: selected ? `${CAPABILITY_COLORS[cap]}18` : 'transparent',
                  color: selected ? CAPABILITY_COLORS[cap] : styles.textDisabled,
                  border: selected ? `1px solid ${CAPABILITY_COLORS[cap]}40` : `1px solid ${styles.borderLight}`,
                  fontWeight: selected ? 600 : 400,
                  '&:hover': {
                    backgroundColor: selected ? `${CAPABILITY_COLORS[cap]}28` : styles.bgHover,
                    borderColor: selected ? `${CAPABILITY_COLORS[cap]}60` : styles.border,
                  },
                }}
              />
            );
          })}
        </Box>

        {/* 清除筛选 */}
        {hasFilters && (
          <Chip
            label="清除"
            size="small"
            onClick={onClearFilters}
            sx={{
              fontSize: '0.6rem',
              height: 20,
              cursor: 'pointer',
              backgroundColor: styles.semantic.errorBg,
              color: styles.semantic.errorText,
              '&:hover': { backgroundColor: isDark ? '#991B1B' : '#FECACA' },
              flexShrink: 0,
            }}
          />
        )}
      </Box>
    </Box>
  );
};

export default ModelFilterBar;
