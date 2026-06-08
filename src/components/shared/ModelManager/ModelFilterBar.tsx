/**
 * ModelFilterBar — 模型筛选栏
 *
 * 提供搜索框和能力标签筛选
 */

import React from 'react';
import { Box, TextField, Chip, IconButton } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { CAPABILITY_LABELS, CAPABILITY_COLORS, type ModelCapability } from '../../../types/models';
import { COLORS } from './styles';

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
  const hasFilters = searchQuery || selectedCapabilities.length > 0;

  return (
    <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${COLORS.borderLight}` }}>
      {/* 搜索框 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <TextField
          size="small"
          placeholder="搜索模型名称、ID、描述..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          fullWidth
          InputProps={{
            startAdornment: <SearchIcon sx={{ fontSize: 18, color: COLORS.textMuted, mr: 0.5 }} />,
            endAdornment: searchQuery ? (
              <IconButton size="small" onClick={() => onSearchChange('')} sx={{ p: 0.3 }}>
                <ClearIcon sx={{ fontSize: 16, color: COLORS.textMuted }} />
              </IconButton>
            ) : null,
            sx: { fontSize: '0.8125rem', height: 36 },
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              backgroundColor: '#FAFAFA',
            },
          }}
        />
        {hasFilters && (
          <Chip
            label="清除筛选"
            size="small"
            onClick={onClearFilters}
            sx={{
              fontSize: '0.75rem',
              height: 28,
              cursor: 'pointer',
              backgroundColor: COLORS.errorBg,
              color: COLORS.errorText,
              '&:hover': { backgroundColor: '#FECACA' },
            }}
          />
        )}
      </Box>

      {/* 能力标签筛选 */}
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: COLORS.textMuted, marginRight: 4 }}>能力：</span>
        {ALL_CAPABILITIES.map(cap => {
          const selected = selectedCapabilities.includes(cap);
          return (
            <Chip
              key={cap}
              label={CAPABILITY_LABELS[cap]}
              size="small"
              onClick={() => onCapabilityToggle(cap)}
              sx={{
                fontSize: '0.7rem',
                height: 24,
                cursor: 'pointer',
                backgroundColor: selected ? `${CAPABILITY_COLORS[cap]}20` : '#F3F4F6',
                color: selected ? CAPABILITY_COLORS[cap] : COLORS.textMuted,
                border: selected ? `1px solid ${CAPABILITY_COLORS[cap]}50` : '1px solid transparent',
                fontWeight: selected ? 600 : 400,
                '&:hover': {
                  backgroundColor: selected ? `${CAPABILITY_COLORS[cap]}30` : '#E5E7EB',
                },
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
};

export default ModelFilterBar;
