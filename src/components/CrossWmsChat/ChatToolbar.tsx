import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  Tooltip,
  Chip,
  useTheme,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import MicIcon from '@mui/icons-material/Mic';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import SettingsIcon from '@mui/icons-material/Settings';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import CheckIcon from '@mui/icons-material/Check';
import TuneIcon from '@mui/icons-material/Tune';
import { Skill } from '../../types/skill';
import { ICON_MAP } from '../../types/skill';
import { getAllSkills } from '../../stores/skillStore';
import { getCategoryLabel, CATEGORY_ORDER } from '../../constants/skillCategories';
import { getGrayScale } from '../../constants/theme';
import { providerIcon } from '../../utils/providerIcons';
import { CAPABILITY_LABELS, CAPABILITY_COLORS, type ModelCapability } from '../../types/models';

// ===================== Types =====================

/** 模型选项（含完整信息，用于模型选择下拉菜单） */
export interface ModelOption {
  /** 模型 ID */
  id: string;
  /** 模型显示名称 */
  name: string;
  /** 提供商 */
  provider: string;
  /** 模型描述 */
  description?: string;
  /** 能力标签 */
  capabilities?: ModelCapability[];
  /** 上下文窗口大小 */
  contextWindow?: number;
  /** 是否为默认模型 */
  isDefault?: boolean;
  /** 是否启用 */
  enabled?: boolean;
}

export interface ChatToolbarProps {
  /** Currently selected model name */
  selectedModel: string;
  /** Callback when user picks a model */
  onModelChange: (name: string) => void;
  /** Currently selected permission */
  selectedPermission: string;
  /** Callback when user picks a permission */
  onPermissionChange: (name: string) => void;
  /** Whether chat is loading */
  isLoading: boolean;
  /** Current input value (for send button enabled state) */
  inputValue: string;
  /** Send handler */
  onSend: () => void;
  /** Stop generation handler */
  onStop?: () => void;
  /** Skill select handler */
  onSkillSelect: (skill: Skill) => void;
  /** Available model options with provider info */
  modelOptions: ModelOption[];
  /** Current preset ID */
  selectedPreset: string;
  /** Callback when user picks a preset */
  onPresetChange: (presetId: string) => void;
  /** Open AI settings (model management) dialog */
  onOpenAISettings?: () => void;
  /** Whether models are still loading from backend */
  modelsLoading?: boolean;
}

// ===================== Constants =====================

  /** 模型参数预设选项 */
  const PRESET_OPTIONS = [
    { id: '', label: '默认', description: '使用模型默认参数' },
    { id: 'creative', label: '创意写作', description: '温度 1.3，适合创意、头脑风暴' },
    { id: 'code', label: '代码生成', description: '温度 0.2，确保代码准确性' },
    { id: 'translate', label: '翻译', description: '温度 0.3，保持翻译一致性' },
    { id: 'analysis', label: '分析推理', description: '温度 0.5，适合逻辑分析' },
    { id: 'precise', label: '精确问答', description: '温度 0.1，追求事实准确性' },
  ];

type DropdownType = 'model' | 'skills' | 'preset' | null;

// ===================== Component =====================

const ChatToolbar: React.FC<ChatToolbarProps> = ({
  selectedModel,
  onModelChange,
  selectedPermission,
  onPermissionChange,
  isLoading,
  inputValue,
  onSend,
  onStop,
  onSkillSelect,
  modelOptions,
  selectedPreset,
  onPresetChange,
  onOpenAISettings,
  modelsLoading = false,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const navigate = useNavigate();
  const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);

  const modelBtnRef = useRef<HTMLDivElement>(null);
  const skillsBtnRef = useRef<HTMLDivElement>(null);
  const presetBtnRef = useRef<HTMLDivElement>(null);

  const handleDropdownClick = (type: DropdownType) => {
    setActiveDropdown(prev => prev === type ? null : type);
  };

  // 参考截图的配色
  const ACCENT = '#F97316'; // 橘色主色调
  const BTN_BG = isDark ? '#2A2A2A' : '#F0F0F0';
  const BTN_HOVER = isDark ? '#333333' : '#E5E5E5';
  const MENU_BG = isDark ? '#1E1E1E' : '#FFFFFF';
  const MENU_BORDER = isDark ? '#333333' : '#E5E5E5';
  const SECTION_TEXT = isDark ? '#888888' : '#9CA3AF';
  const ITEM_TEXT = isDark ? '#E0E0E0' : '#111827';
  const ITEM_DESC = isDark ? '#888888' : '#9CA3AF';
  const SELECTED_BG = isDark ? '#3D2A10' : '#FFF7ED';

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          flexShrink: 0,
        }}
      >
        {/* Left: Skills + Preset */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Skills button — 药丸 */}
          <Box
            ref={skillsBtnRef as React.RefObject<HTMLDivElement>}
            onClick={(e) => { e.stopPropagation(); handleDropdownClick('skills'); }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1.5,
              py: 0.5,
              borderRadius: '20px',
              bgcolor: BTN_BG,
              cursor: 'pointer',
              transition: 'background-color 0.15s',
              '&:hover': { bgcolor: BTN_HOVER },
              userSelect: 'none',
            }}
          >
            <AutoFixHighIcon sx={{ fontSize: 15, color: gs.textMuted }} />
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: ITEM_TEXT, lineHeight: 1 }}>
              Skills
            </Typography>
          </Box>

          {/* Preset button — 药丸，选中时橘色 */}
          <Box
            ref={presetBtnRef as React.RefObject<HTMLDivElement>}
            onClick={(e) => { e.stopPropagation(); handleDropdownClick('preset'); }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1.5,
              py: 0.5,
              borderRadius: '20px',
              bgcolor: selectedPreset
                ? (isDark ? '#3D2A10' : '#FFF7ED')
                : BTN_BG,
              cursor: 'pointer',
              transition: 'background-color 0.15s',
              '&:hover': {
                bgcolor: selectedPreset
                  ? (isDark ? '#4A3518' : '#FFEDD5')
                  : BTN_HOVER,
              },
              userSelect: 'none',
            }}
          >
            <TuneIcon sx={{ fontSize: 15, color: selectedPreset ? ACCENT : gs.textMuted }} />
            <Typography sx={{
              fontSize: 13, fontWeight: 500, lineHeight: 1,
              color: selectedPreset ? ACCENT : ITEM_TEXT,
            }}>
              {selectedPreset ? PRESET_OPTIONS.find(p => p.id === selectedPreset)?.label || '预设' : '预设'}
            </Typography>
          </Box>
        </Box>

        {/* Right: Model selector (ghost text), Memory, Mic, Send */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {/* Model selector — 默认无背景，点击后显示灰色背景 */}
          <Box
            ref={modelBtnRef as React.RefObject<HTMLDivElement>}
            onClick={(e) => { e.stopPropagation(); if (!modelsLoading) handleDropdownClick('model'); }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1.5,
              py: 0.5,
              borderRadius: '20px',
              bgcolor: activeDropdown === 'model' ? BTN_BG : 'transparent',
              cursor: modelsLoading ? 'default' : 'pointer',
              transition: 'background-color 0.15s',
              '&:hover': modelsLoading ? {} : { bgcolor: BTN_HOVER },
              userSelect: 'none',
            }}
          >
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: modelsLoading ? gs.textMuted : ITEM_TEXT, lineHeight: 1 }}>
              {modelsLoading ? '加载模型中...' : (selectedModel === 'Auto' ? 'CDF Auto Model' : selectedModel)}
            </Typography>
            {!modelsLoading && <KeyboardArrowUpIcon sx={{ fontSize: 18, color: gs.textMuted }} />}
          </Box>

          {/* Voice button */}
          <Tooltip title="语音输入">
            <IconButton
              size="small"
              onClick={(e) => e.stopPropagation()}
              sx={{
                width: 32, height: 32, borderRadius: '8px', p: 0,
                color: gs.textMuted, '&:hover': { bgcolor: BTN_BG },
              }}
            >
              <MicIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>

          {/* Send / Stop button — 紫色方形圆角 */}
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              if (isLoading && onStop) {
                onStop();
              } else {
                onSend();
              }
            }}
            disabled={!isLoading && !inputValue.trim()}
            sx={{
              width: 34, height: 34, borderRadius: '10px', p: 0,
              bgcolor: ACCENT,
              color: '#fff',
              flexShrink: 0,
              '&:hover': { bgcolor: '#EA580C' },
              '&.Mui-disabled': { bgcolor: isDark ? '#333' : '#E0E0E0', color: isDark ? '#666' : '#AAA' },
            }}
          >
            {isLoading ? (
              <StopIcon sx={{ fontSize: 16 }} />
            ) : (
              <SendIcon sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        </Box>
      </Box>

      {/* ====== Model Menu — 弹窗在按钮上方，无背景遮罩 ====== */}
      <Menu
        anchorEl={modelBtnRef.current}
        open={activeDropdown === 'model'}
        onClose={() => setActiveDropdown(null)}
        // 关键：弹窗出现在按钮上方
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              width: 320,
              maxHeight: 520,
              mt: -0.5, // 紧贴按钮
              borderRadius: '14px',
              border: `1px solid ${MENU_BORDER}`,
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
              bgcolor: MENU_BG,
              overflow: 'hidden',
            },
          },
          root: {
            sx: {
              '& .MuiMenu-list': { py: 0.5 },
            },
          },
        }}
        MenuListProps={{ disablePadding: true }}
        sx={{
          '& .MuiBackdrop-root': {
            backgroundColor: 'transparent',
          },
        }}
      >
        {/* Auto 选项 */}
        {(() => {
          const autoOption = modelOptions.find(o => o.provider === 'auto');
          if (!autoOption) return null;
          const isSelected = selectedModel === autoOption.name;
          return (
            <MenuItem
              key="auto"
              onClick={() => { onModelChange(autoOption.name); setActiveDropdown(null); }}
              sx={{
                py: 1.25, px: 2, mx: 0.5, borderRadius: '10px',
                backgroundColor: isSelected ? SELECTED_BG : 'transparent',
                '&:hover': { backgroundColor: isSelected ? SELECTED_BG : (isDark ? '#2A2A2A' : '#F5F5F5') },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, width: '100%' }}>
                <AutoModeIcon sx={{ fontSize: 20, color: ACCENT, flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: isSelected ? ACCENT : ITEM_TEXT }}>
                      CDF Auto Model
                    </Typography>
                    <Chip
                      label="智能"
                      size="small"
                      sx={{
                        fontSize: '0.6rem', height: 18,
                        backgroundColor: isDark ? '#3D2A10' : '#FFF7ED',
                        color: ACCENT, fontWeight: 600,
                        borderRadius: '6px',
                      }}
                    />
                  </Box>
                  <Typography sx={{ fontSize: '0.7rem', color: ITEM_DESC, mt: 0.25 }}>
                    根据任务自动选择最合适的模型
                  </Typography>
                </Box>
                {isSelected && (
                  <CheckIcon sx={{ fontSize: 18, color: ACCENT, flexShrink: 0 }} />
                )}
              </Box>
            </MenuItem>
          );
        })()}

        <Divider sx={{ mx: 1.5, my: 0.5, borderColor: MENU_BORDER }} />

        {/* 分组标题 */}
        <Typography sx={{ px: 2, py: 0.5, fontSize: '0.6875rem', fontWeight: 600, color: SECTION_TEXT, letterSpacing: '0.02em' }}>
          可用模型
        </Typography>

        {/* 模型列表 */}
        {modelOptions
          .filter(o => o.provider !== 'auto')
          .map((option) => {
            const isSelected = selectedModel === option.name;
            return (
              <MenuItem
                key={option.id}
                onClick={() => { onModelChange(option.name); setActiveDropdown(null); }}
                sx={{
                  py: 1, px: 2, mx: 0.5, borderRadius: '10px',
                  backgroundColor: isSelected ? SELECTED_BG : 'transparent',
                  '&:hover': { backgroundColor: isSelected ? SELECTED_BG : (isDark ? '#2A2A2A' : '#F5F5F5') },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                  {/* Provider 图标 */}
                  <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    {providerIcon(option.provider, 18)}
                  </Box>

                  {/* 模型信息 */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography sx={{
                        fontSize: '0.8125rem',
                        fontWeight: isSelected ? 600 : 500,
                        color: isSelected ? ACCENT : ITEM_TEXT,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {option.name}
                      </Typography>
                      {option.isDefault && (
                        <Chip
                          label="默认"
                          size="small"
                          sx={{
                            fontSize: '0.55rem', height: 16,
                            backgroundColor: isDark ? '#3D3520' : '#FEF3C7',
                            color: '#D97706', fontWeight: 600,
                            borderRadius: '4px',
                          }}
                        />
                      )}
                    </Box>
                    {option.description && (
                      <Typography sx={{
                        fontSize: '0.7rem',
                        color: ITEM_DESC,
                        mt: 0.15,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {option.description}
                      </Typography>
                    )}
                  </Box>

                  {/* 选中勾 */}
                  {isSelected && (
                    <CheckIcon sx={{ fontSize: 18, color: ACCENT, flexShrink: 0 }} />
                  )}
                </Box>
              </MenuItem>
            );
          })}

        <Divider sx={{ mx: 1.5, my: 0.5, borderColor: MENU_BORDER }} />

        {/* 无已启用模型提示 */}
        {modelOptions.filter(o => o.provider !== 'auto').length === 0 && !modelsLoading && (
          <Box sx={{ px: 2, py: 1, mx: 0.5, borderRadius: '10px', bgcolor: isDark ? '#2A1A0A' : '#FFF7ED' }}>
            <Typography sx={{ fontSize: '0.75rem', color: ACCENT, fontWeight: 500 }}>
              尚未启用任何模型
            </Typography>
            <Typography sx={{ fontSize: '0.6875rem', color: ITEM_DESC, mt: 0.25 }}>
              请在模型管理中添加 API Key 并启用模型
            </Typography>
          </Box>
        )}

        {/* 管理模型入口 */}
        <MenuItem
          onClick={() => { setActiveDropdown(null); onOpenAISettings?.(); }}
          sx={{ py: 1, mx: 0.5, borderRadius: '10px', '&:hover': { bgcolor: isDark ? '#2A2A2A' : '#F5F5F5' } }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <SettingsIcon sx={{ fontSize: 16, color: SECTION_TEXT }} />
          </ListItemIcon>
          <Typography sx={{ fontSize: '0.8125rem', color: SECTION_TEXT }}>添加模型</Typography>
        </MenuItem>
      </Menu>

      {/* ====== Skills Menu — 弹窗在按钮上方，无背景遮罩 ====== */}
      <Menu
        anchorEl={skillsBtnRef.current}
        open={activeDropdown === 'skills'}
        onClose={() => setActiveDropdown(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              width: 280,
              maxHeight: 400,
              mt: -0.5,
              borderRadius: '14px',
              border: `1px solid ${MENU_BORDER}`,
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
              bgcolor: MENU_BG,
            },
          },
        }}
        sx={{
          '& .MuiBackdrop-root': {
            backgroundColor: 'transparent',
          },
        }}
      >
        {(() => {
          const activeSkills = getAllSkills().filter(s => s.status === 'active');
          const grouped: Record<string, Skill[]> = {};
          for (const s of activeSkills) {
            if (!grouped[s.category]) grouped[s.category] = [];
            grouped[s.category].push(s);
          }
          const result: React.ReactNode[] = [];
          for (const cat of CATEGORY_ORDER) {
            const items = grouped[cat];
            if (!items || items.length === 0) continue;
            result.push(
              <Typography key={`cat-${cat}`} sx={{ px: 2, py: 0.5, fontSize: '0.6875rem', fontWeight: 600, color: SECTION_TEXT }}>
                {getCategoryLabel(cat)}
              </Typography>
            );
            for (const skill of items.slice(0, 4)) {
              result.push(
                <MenuItem
                  key={skill.id}
                  onClick={() => { onSkillSelect(skill); setActiveDropdown(null); }}
                  sx={{ py: 0.75, px: 2, mx: 0.5, borderRadius: '8px', '&:hover': { bgcolor: isDark ? '#2A2A2A' : '#F5F5F5' } }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 18 }} />}
                  </ListItemIcon>
                  <Typography sx={{ fontSize: '0.8125rem', color: ITEM_TEXT }}>{skill.name}</Typography>
                </MenuItem>
              );
            }
          }
          return result;
        })()}
        <Divider sx={{ mx: 1.5, borderColor: MENU_BORDER }} />
        <MenuItem
          onClick={() => { setActiveDropdown(null); navigate('/skills'); }}
          sx={{ py: 0.75, mx: 0.5, borderRadius: '8px', '&:hover': { bgcolor: isDark ? '#2A2A2A' : '#F5F5F5' } }}
        >
          <ListItemIcon><SettingsIcon sx={{ fontSize: 16, color: SECTION_TEXT }} /></ListItemIcon>
          <Typography sx={{ fontSize: '0.8125rem', color: SECTION_TEXT }}>查看全部技能 →</Typography>
        </MenuItem>
      </Menu>

      {/* ====== Preset Menu — 弹窗在按钮上方，无背景遮罩 ====== */}
      <Menu
        anchorEl={presetBtnRef.current}
        open={activeDropdown === 'preset'}
        onClose={() => setActiveDropdown(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              width: 240,
              mt: -0.5,
              borderRadius: '14px',
              border: `1px solid ${MENU_BORDER}`,
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
              bgcolor: MENU_BG,
            },
          },
        }}
        sx={{
          '& .MuiBackdrop-root': {
            backgroundColor: 'transparent',
          },
        }}
      >
        {PRESET_OPTIONS.map((option) => (
          <MenuItem
            key={option.id}
            onClick={() => { onPresetChange(option.id); setActiveDropdown(null); }}
            sx={{
              py: 1, px: 2, mx: 0.5, borderRadius: '10px',
              backgroundColor: selectedPreset === option.id ? SELECTED_BG : 'transparent',
              '&:hover': { backgroundColor: selectedPreset === option.id ? SELECTED_BG : (isDark ? '#2A2A2A' : '#F5F5F5') },
            }}
          >
            <Box sx={{ width: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{
                  fontSize: '0.8125rem',
                  fontWeight: selectedPreset === option.id ? 600 : 400,
                  color: selectedPreset === option.id ? ACCENT : ITEM_TEXT,
                }}>
                  {option.label}
                </Typography>
                {selectedPreset === option.id && (
                  <CheckIcon sx={{ fontSize: 16, color: ACCENT, ml: 'auto' }} />
                )}
              </Box>
              <Typography sx={{ fontSize: '0.7rem', color: ITEM_DESC, mt: 0.25 }}>
                {option.description}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default ChatToolbar;
