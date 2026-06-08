import React from 'react';
import { TextField, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: number | string;
  fullWidth?: boolean;
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  sx?: object;
}

/**
 * 全局统一搜索输入框 — 以 SkillsPage 搜索框为标准模版
 * 无边框灰色背景，聚焦时白色背景+黑色边框
 */
const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = '搜索...',
  width = 200,
  fullWidth = false,
  autoFocus = false,
  onFocus,
  onBlur,
  sx,
}) => {
  const baseSx = fullWidth
    ? {
        '& .MuiOutlinedInput-root': {
          borderRadius: '8px',
          backgroundColor: '#F0F0F0',
          fontSize: '0.8125rem',
          '& fieldset': { border: 'none' },
          '&:hover': { backgroundColor: '#E8E8E8' },
          '&.Mui-focused': { backgroundColor: '#fff', '& fieldset': { border: '1px solid #1A1A1A' } },
        },
        '& .MuiInputBase-input': { py: 0.75, fontSize: '0.8125rem', color: '#666' },
      }
    : {
        width,
        '& .MuiOutlinedInput-root': {
          borderRadius: '8px',
          backgroundColor: '#F0F0F0',
          fontSize: '0.8125rem',
          '& fieldset': { border: 'none' },
          '&:hover': { backgroundColor: '#E8E8E8' },
          '&.Mui-focused': { backgroundColor: '#fff', '& fieldset': { border: '1px solid #1A1A1A' } },
        },
        '& .MuiInputBase-input': { py: 0.75, fontSize: '0.8125rem', color: '#666' },
      };

  return (
    <TextField
      size="small"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      fullWidth={fullWidth}
      autoFocus={autoFocus}
      onFocus={onFocus}
      onBlur={onBlur}
      sx={{ ...baseSx, ...sx }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon sx={{ fontSize: 16, color: '#999' }} />
          </InputAdornment>
        ),
      }}
    />
  );
};

export default SearchInput;
