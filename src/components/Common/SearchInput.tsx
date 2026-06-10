import React from 'react';
import { TextField, InputAdornment, useTheme } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { getGrayScale } from '../../constants/theme';

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
 * 全局统一搜索输入框 — 适配深色/浅色模式
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
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const baseSx = fullWidth
    ? {
        '& .MuiOutlinedInput-root': {
          borderRadius: '8px',
          backgroundColor: gs.bgHover,
          fontSize: '0.8125rem',
          '& fieldset': { border: 'none' },
          '&:hover': { backgroundColor: gs.bgActive },
          '&.Mui-focused': { backgroundColor: gs.bgInput, '& fieldset': { border: `1px solid ${gs.textMuted}` } },
        },
        '& .MuiInputBase-input': { py: 0.75, fontSize: '0.8125rem', color: gs.textPrimary },
      }
    : {
        width,
        '& .MuiOutlinedInput-root': {
          borderRadius: '8px',
          backgroundColor: gs.bgHover,
          fontSize: '0.8125rem',
          '& fieldset': { border: 'none' },
          '&:hover': { backgroundColor: gs.bgActive },
          '&.Mui-focused': { backgroundColor: gs.bgInput, '& fieldset': { border: `1px solid ${gs.textMuted}` } },
        },
        '& .MuiInputBase-input': { py: 0.75, fontSize: '0.8125rem', color: gs.textPrimary },
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
            <SearchIcon sx={{ fontSize: 16, color: gs.textMuted }} />
          </InputAdornment>
        ),
      }}
    />
  );
};

export default SearchInput;
