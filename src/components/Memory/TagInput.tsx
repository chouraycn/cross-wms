/**
 * TagInput - 标签输入组件
 *
 * 功能：
 * - 支持输入标签并以 Chip 形式展示
 * - 支持删除单个标签
 * - 支持批量清空
 * - 支持预设标签建议
 */

import React, { useState, useCallback, memo } from 'react';
import {
  Box,
  TextField,
  Chip,
  IconButton,
  Typography,
  Tooltip,
  useTheme,
  Autocomplete,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ClearIcon from '@mui/icons-material/Clear';
import { getGrayScale } from '../../constants/theme';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  label?: string;
  placeholder?: string;
  maxTags?: number;
  disabled?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const TagInput: React.FC<TagInputProps> = memo(({
  tags,
  onChange,
  suggestions = [],
  label = '标签',
  placeholder = '输入标签后按 Enter',
  maxTags = 10,
  disabled = false,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [inputValue, setInputValue] = useState('');

  const handleAddTag = useCallback((tag: string) => {
    const trimmedTag = tag.trim();
    if (!trimmedTag || tags.includes(trimmedTag) || tags.length >= maxTags) {
      return;
    }
    onChange([...tags, trimmedTag]);
    setInputValue('');
  }, [tags, maxTags, onChange]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    onChange(tags.filter(tag => tag !== tagToRemove));
  }, [tags, onChange]);

  const handleClearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      handleAddTag(inputValue);
    }
  }, [inputValue, handleAddTag]);

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textSecondary }}>
          {label}
        </Typography>
        {tags.length > 0 && (
          <Tooltip title="清空所有标签">
            <IconButton
              size="small"
              onClick={handleClearAll}
              disabled={disabled}
              sx={{ color: gs.textMuted, '&:hover': { color: '#EF4444' } }}
            >
              <ClearIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* 标签展示区 */}
      {tags.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
          {tags.map((tag, index) => (
            <Chip
              key={index}
              label={tag}
              size="small"
              onDelete={() => handleRemoveTag(tag)}
              disabled={disabled}
              sx={{
                backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
                color: gs.textPrimary,
                fontSize: '0.75rem',
                height: 24,
              }}
            />
          ))}
        </Box>
      )}

      {/* 输入框 */}
      {suggestions.length > 0 ? (
        <Autocomplete
          freeSolo
          options={suggestions}
          inputValue={inputValue}
          onInputChange={(e, value) => setInputValue(value)}
          onChange={(e, value) => {
            if (value) handleAddTag(value);
          }}
          disabled={disabled || tags.length >= maxTags}
          renderInput={(params) => (
            <TextField
              {...params}
              size="small"
              placeholder={tags.length >= maxTags ? `最多 ${maxTags} 个标签` : placeholder}
              onKeyDown={handleKeyDown}
              sx={{
                '& .MuiInputBase-input': {
                  fontSize: '0.85rem',
                },
              }}
            />
          )}
        />
      ) : (
        <TextField
          size="small"
          placeholder={tags.length >= maxTags ? `最多 ${maxTags} 个标签` : placeholder}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || tags.length >= maxTags}
          fullWidth
          sx={{
            '& .MuiInputBase-input': {
              fontSize: '0.85rem',
            },
          }}
          InputProps={{
            endAdornment: inputValue.trim() && !disabled && tags.length < maxTags && (
              <IconButton
                size="small"
                onClick={() => handleAddTag(inputValue)}
                sx={{ color: gs.textMuted, '&:hover': { color: '#6366F1' } }}
              >
                <AddIcon fontSize="small" />
              </IconButton>
            ),
          }}
        />
      )}

      {/* 标签数量提示 */}
      <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted, mt: 0.5 }}>
        {tags.length} / {maxTags} 个标签
      </Typography>
    </Box>
  );
});

TagInput.displayName = 'TagInput';

export default TagInput;