/**
 * ModelFilterBar — 模型能力标签筛选栏（已移除搜索框）
 *
 * 布局策略：
 * - 仅保留能力标签筛选
 * - 超出宽度时可横向滚动
 */

import React from 'react';
import { Box, Chip, useTheme } from '@mui/material';
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
  selectedCapabilities,
  onCapabilityToggle,
  onClearFilters,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const styles = getModelManagerStyles(isDark);
  const hasFilters = selectedCapabilities.length > 0;

  return (
    <Box sx={{ px: 0, py: 1.5 }}>
      {/* 能力标签 - 紧凑样式，不换行，超出可滚动 */}
      <Box
        sx={{
          display: 'flex',
          gap: 0.4,
          alignItems: 'center',
          flexWrap: 'nowrap',
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
