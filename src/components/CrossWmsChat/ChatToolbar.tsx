import React, { useRef, useState, useEffect } from 'react';
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
import AttachFileIcon from '@mui/icons-material/AttachFile';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import SmartToyIcon from '@mui/icons-material/SmartToy';

import { Skill } from '../../types/skill';
import { ICON_MAP } from '../../types/skill';
import { getAllSkills } from '../../stores/skillStore';
import { getCategoryLabel, CATEGORY_ORDER } from '../../constants/skillCategories';
import { getGrayScale } from '../../constants/theme';
import { providerIcon } from '../../utils/providerIcons';
import { CAPABILITY_LABELS, CAPABILITY_COLORS, type ModelCapability } from '../../types/models';
import { useToolPermission } from '../../contexts/ToolPermissionContext';

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
  /** Open AI settings (model management) dialog */
  onOpenAISettings?: () => void;
  /** Whether models are still loading from backend */
  modelsLoading?: boolean;
  /** v1.9.0: 附件按钮点击回调 */
  onAttachClick?: () => void;
  /** v1.9.0: 是否有待上传附件 */
  hasAttachments?: boolean;
  /** v1.9.1: 推理强度（'high' / 'max'） */
  reasoningEffort?: string;
  /** v1.9.1: 推理强度切换回调 */
  onReasoningEffortChange?: (effort: string) => void;
  /** v8.0: 专家选择回调 */
  onExpertClick?: () => void;
  /** v8.0: 当前选中的专家名称 */
  selectedExpertName?: string;
}

// ===================== Constants =====================

type DropdownType = 'model' | 'skills' | null;

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
  onOpenAISettings,
  modelsLoading = false,
  onAttachClick,
  hasAttachments = false,
  reasoningEffort,
  onReasoningEffortChange,
  onExpertClick,
  selectedExpertName,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const navigate = useNavigate();
  const { trustMode, toggleTrustMode } = useToolPermission();
  const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);

  const modelBtnRef = useRef<HTMLDivElement>(null);
  const skillsBtnRef = useRef<HTMLDivElement>(null);

  // 点击弹窗外部自动关闭（兜底处理，确保透明 backdrop 下也能关闭）
  useEffect(() => {
    if (!activeDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        modelBtnRef.current?.contains(target) ||
        skillsBtnRef.current?.contains(target)
      ) return;
      // 如果点击在 Menu 的 Paper 内部，不关闭
      const menuPaper = document.querySelector('.MuiMenu-root .MuiPaper-root');
      if (menuPaper?.contains(target)) return;
      setActiveDropdown(null);
    };
    // 使用 capture 阶段确保优先于 MUI 内部处理
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [activeDropdown]);

  const handleDropdownClick = (type: DropdownType) => {
    setActiveDropdown(prev => prev === type ? null : type);
  };

  // 参考截图的配色（灰阶使用主题系统，语义色保留）
  const ACCENT = '#F97316'; // 橘色主色调
  const SELECTED_BG = isDark ? '#3D2A10' : '#FFF7ED'; // 橙色选中态

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
        {/* Left: Skills + Attach */}
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
              bgcolor: gs.bgHover,
              cursor: 'pointer',
              transition: 'background-color 0.15s',
              '&:hover': { bgcolor: gs.bgActive },
              userSelect: 'none',
            }}
          >
            <AutoFixHighIcon sx={{ fontSize: 15, color: gs.textMuted }} />
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: gs.textPrimary, lineHeight: 1 }}>
              Skills
            </Typography>
          </Box>

          {/* Attach button — 药丸 */}
          {onAttachClick && (
            <Box
              onClick={(e) => { e.stopPropagation(); onAttachClick(); }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1.5,
                py: 0.5,
                borderRadius: '20px',
                bgcolor: gs.bgHover,
                cursor: 'pointer',
                transition: 'background-color 0.15s',
                '&:hover': { bgcolor: gs.bgActive },
                userSelect: 'none',
              }}
            >
              <AttachFileIcon sx={{ fontSize: 15, color: gs.textMuted }} />
              <Typography sx={{ fontSize: 13, fontWeight: 500, color: gs.textPrimary, lineHeight: 1 }}>
                附件
              </Typography>
            </Box>
          )}

          {/* Reasoning effort toggle — 药丸 */}
          {onReasoningEffortChange && (
            <Box
              onClick={(e) => {
                e.stopPropagation();
                // 循环切换: '' -> 'high' -> 'max' -> ''
                const next = reasoningEffort === 'high' ? 'max' : reasoningEffort === 'max' ? '' : 'high';
                onReasoningEffortChange(next);
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1.5,
                py: 0.5,
                borderRadius: '20px',
                bgcolor: reasoningEffort ? (reasoningEffort === 'max' ? (isDark ? '#3D2A10' : '#FFF7ED') : (isDark ? '#2A1A3A' : '#F3E8FF')) : gs.bgHover,
                cursor: 'pointer',
                transition: 'background-color 0.15s',
                '&:hover': { bgcolor: reasoningEffort ? (reasoningEffort === 'max' ? (isDark ? '#4A3518' : '#FFEDD5') : (isDark ? '#3A1A4A' : '#E9D5FF')) : gs.bgActive },
                userSelect: 'none',
              }}
            >
              <AutoAwesomeIcon sx={{ fontSize: 15, color: reasoningEffort ? (reasoningEffort === 'max' ? '#F59E0B' : '#8B5CF6') : gs.textMuted }} />
              <Typography sx={{ fontSize: 13, fontWeight: 500, color: reasoningEffort ? (reasoningEffort === 'max' ? '#F59E0B' : '#8B5CF6') : gs.textPrimary, lineHeight: 1 }}>
                {reasoningEffort === 'max' ? '极致推理' : reasoningEffort === 'high' ? '深度思考' : '思考'}
              </Typography>
            </Box>
          )}

          {/* v2.5.0: Trust mode toggle — 免确认模式 */}
          <Tooltip title={trustMode ? '免确认模式已开启：工具自动执行' : '开启免确认模式：跳过工具授权弹窗'}>
            <Box
              onClick={(e) => { e.stopPropagation(); toggleTrustMode(); }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1.5,
                py: 0.5,
                borderRadius: '20px',
                bgcolor: trustMode ? (isDark ? '#0A2E1A' : '#ECFDF5') : gs.bgHover,
                border: trustMode ? `1px solid ${isDark ? '#10B98140' : '#10B98130'}` : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
                '&:hover': { bgcolor: trustMode ? (isDark ? '#0D3A20' : '#D1FAE5') : gs.bgActive },
                userSelect: 'none',
              }}
            >
              {trustMode
                ? <VerifiedUserIcon sx={{ fontSize: 15, color: '#10B981' }} />
                : <ShieldOutlinedIcon sx={{ fontSize: 15, color: gs.textMuted }} />
              }
              <Typography sx={{
                fontSize: 13, fontWeight: 500, lineHeight: 1,
                color: trustMode ? '#10B981' : gs.textPrimary,
              }}>
                {trustMode ? '免确认' : '授权'}
              </Typography>
            </Box>
          </Tooltip>

          {/* v8.0: Expert selector pill */}
          {onExpertClick && (
            <Tooltip title={selectedExpertName ? `当前专家：${selectedExpertName}` : '选择 AI 专家'}>
              <Box
                onClick={(e) => { e.stopPropagation(); onExpertClick(); }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 1.5,
                  py: 0.5,
                  borderRadius: '20px',
                  bgcolor: selectedExpertName ? (isDark ? '#2A1A4A' : '#F3E8FF') : gs.bgHover,
                  border: selectedExpertName ? `1px solid ${isDark ? '#7C3AED40' : '#DDD6FE'}` : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  '&:hover': { bgcolor: selectedExpertName ? (isDark ? '#3A1A5A' : '#E9D5FF') : gs.bgActive },
                  userSelect: 'none',
                }}
              >
                <SmartToyIcon sx={{
                  fontSize: 15,
                  color: selectedExpertName ? '#7C3AED' : gs.textMuted,
                }} />
                <Typography sx={{
                  fontSize: 13, fontWeight: 500, lineHeight: 1,
                  color: selectedExpertName ? '#7C3AED' : gs.textPrimary,
                }}>
                  {selectedExpertName || '专家'}
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>

        {/* Right: Model selector, Memory, Mic, Send */}
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
              bgcolor: activeDropdown === 'model' ? gs.bgHover : 'transparent',
              cursor: modelsLoading ? 'default' : 'pointer',
              transition: 'background-color 0.15s',
              '&:hover': modelsLoading ? {} : { bgcolor: gs.bgActive },
              userSelect: 'none',
            }}
          >
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: modelsLoading ? gs.textMuted : gs.textPrimary, lineHeight: 1 }}>
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
                color: gs.textMuted, '&:hover': { bgcolor: gs.bgHover },
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
              border: `1px solid ${gs.border}`,
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
              bgcolor: gs.bgPanel,
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
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: isSelected ? ACCENT : gs.textPrimary }}>
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
                  <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, mt: 0.25 }}>
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

        <Divider sx={{ mx: 1.5, my: 0.5, borderColor: gs.border }} />

        {/* 分组标题 */}
        <Typography sx={{ px: 2, py: 0.5, fontSize: '0.6875rem', fontWeight: 600, color: gs.textMuted, letterSpacing: '0.02em' }}>
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
                        color: isSelected ? ACCENT : gs.textPrimary,
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.15, flexWrap: 'wrap' }}>
                      {option.capabilities?.map(cap => (
                        <Chip
                          key={cap}
                          label={CAPABILITY_LABELS[cap]}
                          size="small"
                          sx={{
                            fontSize: '0.55rem',
                            height: 14,
                            backgroundColor: `${CAPABILITY_COLORS[cap]}15`,
                            color: CAPABILITY_COLORS[cap],
                            fontWeight: 500,
                          }}
                        />
                      ))}
                      {option.description && (
                        <Typography sx={{
                          fontSize: '0.7rem',
                          color: gs.textMuted,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {option.description}
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  {/* 选中勾 */}
                  {isSelected && (
                    <CheckIcon sx={{ fontSize: 18, color: ACCENT, flexShrink: 0 }} />
                  )}
                </Box>
              </MenuItem>
            );
          })}

        <Divider sx={{ mx: 1.5, my: 0.5, borderColor: gs.border }} />

        {/* 无已启用模型提示 */}
        {modelOptions.filter(o => o.provider !== 'auto').length === 0 && !modelsLoading && (
          <Box sx={{ px: 2, py: 1, mx: 0.5, borderRadius: '10px', bgcolor: isDark ? '#2A1A0A' : '#FFF7ED' }}>
            <Typography sx={{ fontSize: '0.75rem', color: ACCENT, fontWeight: 500 }}>
              尚未启用任何模型
            </Typography>
            <Typography sx={{ fontSize: '0.6875rem', color: gs.textMuted, mt: 0.25 }}>
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
            <SettingsIcon sx={{ fontSize: 16, color: gs.textMuted }} />
          </ListItemIcon>
          <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted }}>添加模型</Typography>
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
              border: `1px solid ${gs.border}`,
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
              bgcolor: gs.bgPanel,
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
              <Typography key={`cat-${cat}`} sx={{ px: 2, py: 0.5, fontSize: '0.6875rem', fontWeight: 600, color: gs.textMuted }}>
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
                  <Typography sx={{ fontSize: '0.8125rem', color: gs.textPrimary }}>{skill.name}</Typography>
                </MenuItem>
              );
            }
          }
          return result;
        })()}
        <Divider sx={{ mx: 1.5, borderColor: gs.border }} />
        <MenuItem
          onClick={() => { setActiveDropdown(null); navigate('/skills'); }}
          sx={{ py: 0.75, mx: 0.5, borderRadius: '8px', '&:hover': { bgcolor: isDark ? '#2A2A2A' : '#F5F5F5' } }}
        >
          <ListItemIcon><SettingsIcon sx={{ fontSize: 16, color: gs.textMuted }} /></ListItemIcon>
          <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted }}>查看全部技能 →</Typography>
        </MenuItem>
      </Menu>



    </>
  );
};

export default ChatToolbar;
