import React, { useCallback } from 'react';
import { Box, Typography, Button, Switch, Tooltip } from '@mui/material';
import type { AppSettings, AppearanceConfig, ThemeMode, AccentColor, FontSize, BorderRadius } from '../../../contexts/AppSettingsContext';

const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: '#111827' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#111827' },
};

export interface AppearanceTabProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
}

const AppearanceTab: React.FC<AppearanceTabProps> = ({ draft, setDraft }) => {
  const updateAppearance = useCallback(<K extends keyof AppearanceConfig>(key: K, value: AppearanceConfig[K]) => {
    setDraft(prev => ({
      ...prev,
      appearance: { ...prev.appearance, [key]: value },
    }));
  }, [setDraft]);

  const accentColors: { key: AccentColor; label: string; color: string }[] = [
    { key: 'default', label: '默认', color: '#111827' },
    { key: 'blue', label: '蓝色', color: '#2563EB' },
    { key: 'green', label: '绿色', color: '#059669' },
    { key: 'purple', label: '紫色', color: '#7C3AED' },
    { key: 'red', label: '红色', color: '#DC2626' },
    { key: 'orange', label: '橙色', color: '#EA580C' },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 主题模式 */}
      <Box>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>主题模式</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {([['light', '浅色'], ['dark', '深色'], ['system', '跟随系统']] as [ThemeMode, string][]).map(([mode, label]) => (
            <Button
              key={mode}
              size="small"
              variant={draft.appearance.themeMode === mode ? 'contained' : 'outlined'}
              onClick={() => updateAppearance('themeMode', mode)}
              sx={{
                fontSize: '0.7rem', minWidth: 0, px: 1.5, py: 0.3,
                ...(draft.appearance.themeMode === mode
                  ? { backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' } }
                  : { borderColor: '#E5E7EB', color: '#6B7280', '&:hover': { borderColor: '#9CA3AF' } }),
              }}
            >
              {label}
            </Button>
          ))}
        </Box>
      </Box>

      {/* 强调色 */}
      <Box>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>强调色</Typography>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          {accentColors.map(({ key, label, color }) => (
            <Tooltip key={key} title={label} arrow placement="top">
              <Box
                onClick={() => updateAppearance('accentColor', key)}
                sx={{
                  width: 28, height: 28, borderRadius: '50%', backgroundColor: color, cursor: 'pointer',
                  border: draft.appearance.accentColor === key ? '2.5px solid #111827' : '2.5px solid transparent',
                  transform: draft.appearance.accentColor === key ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 0.15s',
                  '&:hover': { transform: 'scale(1.1)' },
                }}
              />
            </Tooltip>
          ))}
        </Box>
      </Box>

      {/* 字体大小 */}
      <Box>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>字体大小</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {([['small', '小'], ['medium', '中'], ['large', '大']] as [FontSize, string][]).map(([size, label]) => (
            <Button
              key={size}
              size="small"
              variant={draft.appearance.fontSize === size ? 'contained' : 'outlined'}
              onClick={() => updateAppearance('fontSize', size)}
              sx={{
                fontSize: size === 'small' ? '0.65rem' : size === 'large' ? '0.85rem' : '0.75rem',
                minWidth: 0, px: 1.5, py: 0.3,
                ...(draft.appearance.fontSize === size
                  ? { backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' } }
                  : { borderColor: '#E5E7EB', color: '#6B7280', '&:hover': { borderColor: '#9CA3AF' } }),
              }}
            >
              {label}
            </Button>
          ))}
        </Box>
      </Box>

      {/* 圆角风格 */}
      <Box>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>圆角风格</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {([['sharp', '直角'], ['normal', '标准'], ['rounded', '圆角']] as [BorderRadius, string][]).map(([br, label]) => (
            <Button
              key={br}
              size="small"
              variant={draft.appearance.borderRadius === br ? 'contained' : 'outlined'}
              onClick={() => updateAppearance('borderRadius', br)}
              sx={{
                borderRadius: br === 'sharp' ? 0 : br === 'rounded' ? 12 : 4,
                fontSize: '0.7rem', minWidth: 0, px: 1.5, py: 0.3,
                ...(draft.appearance.borderRadius === br
                  ? { backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' } }
                  : { borderColor: '#E5E7EB', color: '#6B7280', '&:hover': { borderColor: '#9CA3AF' } }),
              }}
            >
              {label}
            </Button>
          ))}
        </Box>
      </Box>

      {/* 开关项 */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {([
          { key: 'enableAnimations' as const, label: '动画效果', desc: '页面过渡与交互动画' },
          { key: 'enableShadows' as const, label: '阴影效果', desc: '卡片与弹窗投影' },
          { key: 'compactMode' as const, label: '紧凑模式', desc: '减少内边距，显示更多内容' },
        ]).map(({ key, label, desc }) => (
          <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.25 }}>
            <Box>
              <Typography sx={{ fontSize: '0.75rem', color: '#374151' }}>{label}</Typography>
              <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>{desc}</Typography>
            </Box>
            <Switch
              size="small"
              checked={draft.appearance[key]}
              onChange={e => updateAppearance(key, e.target.checked)}
              sx={switchSx}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default AppearanceTab;
