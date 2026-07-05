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
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import PsychologyIcon from '@mui/icons-material/Psychology';

import { Skill } from '../../types/skill';
import { ICON_MAP } from '../../types/skill';
import { getAllSkillsSortedByUsage } from '../../stores/skillStore';
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
  /** Open AI settings (model management) dialog */
  onOpenAISettings?: () => void;
  /** Whether models are still loading from backend */
  modelsLoading?: boolean;
  /** v1.9.0: 附件按钮点击回调 */
  onAttachClick?: () => void;
  /** v1.9.0: 是否有待上传附件 */
  hasAttachments?: boolean;
  /** 思考级别（off/low/medium/high），为空表示不支持 */
  thinkingLevel?: string;
  /** 思考级别切换回调 */
  onThinkingLevelChange?: (level: string) => void;
  /** 可用的思考级别选项 */
  thinkingLevels?: Array<{ value: string; label: string; desc?: string }>;
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
  thinkingLevel,
  onThinkingLevelChange,
  thinkingLevels,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const navigate = useNavigate();
  const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);

  const modelBtnRef = useRef<HTMLDivElement>(null);
  const skillsBtnRef = useRef<HTMLDivElement>(null);
  const thinkingBtnRef = useRef<HTMLDivElement>(null);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);

  const BASE_THINKING_LEVELS = [
    { value: 'off', label: '关闭思考', desc: '直接输出结果，不进行深度推理' },
    { value: 'low', label: '快速思考', desc: '轻量推理，响应更快' },
    { value: 'medium', label: '标准思考', desc: '平衡推理深度和速度' },
    { value: 'high', label: '深度思考', desc: '更深入的推理分析' },
  ];

  const availableThinkingLevels = thinkingLevels || BASE_THINKING_LEVELS;
  const currentThinking = availableThinkingLevels.find(t => t.value === (thinkingLevel || 'off')) || availableThinkingLevels[0];
  const isThinkingOn = thinkingLevel && thinkingLevel !== 'off';

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
          padding: '3px 12px 6px 12px',
          flexShrink: 0,
        }}
      >
        {/* Left: Skills + Attach */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Skills button — 仅图标 */}
          <Box
            ref={skillsBtnRef as React.RefObject<HTMLDivElement>}
            onClick={(e) => { e.stopPropagation(); handleDropdownClick('skills'); }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: '50%',
              bgcolor: isDark ? 'rgba(0,0,0,0.2)' : '#F5F5F5',
              cursor: 'pointer',
              transition: 'background-color 0.15s',
              '&:hover': { bgcolor: gs.bgActive },
              userSelect: 'none',
            }}
          >
            <AutoFixHighIcon sx={{ fontSize: 18, color: gs.textMuted }} />
          </Box>

          {/* Attach button — 仅图标 */}
          {onAttachClick && (
            <Box
              onClick={(e) => { e.stopPropagation(); onAttachClick(); }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: '50%',
                bgcolor: isDark ? 'rgba(0,0,0,0.2)' : '#F5F5F5',
                cursor: 'pointer',
                transition: 'background-color 0.15s',
                '&:hover': { bgcolor: gs.bgActive },
                userSelect: 'none',
                position: 'relative',
              }}
            >
              <AttachFileIcon sx={{ fontSize: 18, color: gs.textMuted }} />
              {hasAttachments && (
                <Box sx={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: ACCENT,
                }} />
              )}
            </Box>
          )}

          {/* Thinking button — 思考模式切换 */}
          {onThinkingLevelChange && (
            <>
              <Box
                ref={thinkingBtnRef as React.RefObject<HTMLDivElement>}
                onClick={(e) => { e.stopPropagation(); setThinkingMenuOpen(prev => !prev); }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  bgcolor: isThinkingOn
                    ? (isDark ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.1)')
                    : (isDark ? 'rgba(0,0,0,0.2)' : '#F5F5F5'),
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                  '&:hover': { bgcolor: isThinkingOn
                    ? (isDark ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.15)')
                    : gs.bgActive },
                  userSelect: 'none',
                  position: 'relative',
                }}
              >
                <Tooltip title={isThinkingOn ? `思考模式：${currentThinking.label}` : '开启深度思考'}>
                  <PsychologyIcon sx={{ fontSize: 18, color: isThinkingOn ? '#8B5CF6' : gs.textMuted }} />
                </Tooltip>
                {isThinkingOn && (
                  <Box sx={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: '#8B5CF6',
                  }} />
                )}
              </Box>
              <Menu
                anchorEl={thinkingBtnRef.current}
                open={thinkingMenuOpen}
                onClose={() => setThinkingMenuOpen(false)}
                anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                slotProps={{
                  paper: {
                    sx: {
                      width: 260,
                      mt: -0.5,
                      borderRadius: '14px',
                      border: `1px solid ${gs.border}`,
                      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                      bgcolor: gs.bgPanel,
                    },
                  },
                }}
                sx={{
                  '& .MuiBackdrop-root': { backgroundColor: 'transparent' },
                }}
              >
                <Box sx={{ px: 2, py: 1, borderBottom: `1px solid ${gs.border}` }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textPrimary }}>
                    思考模式
                  </Typography>
                  <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted, mt: 0.25 }}>
                    控制 AI 推理深度，越深越慢但更准确
                  </Typography>
                </Box>
                {availableThinkingLevels.map((level) => {
                  const isSelected = (thinkingLevel || 'off') === level.value;
                  return (
                    <MenuItem
                      key={level.value}
                      onClick={() => {
                        onThinkingLevelChange(level.value);
                        setThinkingMenuOpen(false);
                      }}
                      sx={{
                        py: 1, mx: 0.5, borderRadius: '10px',
                        backgroundColor: isSelected ? SELECTED_BG : 'transparent',
                        '&:hover': { backgroundColor: isSelected ? SELECTED_BG : (isDark ? '#2A2A2A' : '#F5F5F5') },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, width: '100%' }}>
                        <PsychologyIcon sx={{ fontSize: 18, color: isSelected ? '#8B5CF6' : gs.textMuted, flexShrink: 0 }} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.8125rem', fontWeight: isSelected ? 600 : 500, color: isSelected ? '#8B5CF6' : gs.textPrimary }}>
                            {level.label}
                          </Typography>
                          {level.desc && (
                            <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, mt: 0.25 }}>
                              {level.desc}
                            </Typography>
                          )}
                        </Box>
                        {isSelected && (
                          <CheckIcon sx={{ fontSize: 18, color: '#8B5CF6', flexShrink: 0 }} />
                        )}
                      </Box>
                    </MenuItem>
                  );
                })}
              </Menu>
            </>
          )}

          </Box>

        {/* Right: Model selector, Memory, Mic, Send */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mr: 0.5 }}>
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

          {/* Send / Stop button — 圆形 */}
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
              width: 34, height: 34, borderRadius: '50%', p: 0,
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

      {/* ====== Model Menu — 弹窗在按钮上方，右对齐，无背景遮罩 ====== */}
      <Menu
        anchorEl={modelBtnRef.current}
        open={activeDropdown === 'model'}
        onClose={() => setActiveDropdown(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              width: 320,
              maxHeight: 520,
              mt: -0.5,
              borderRadius: '14px',
              border: `1px solid ${gs.border}`,
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
              bgcolor: gs.bgPanel,
              overflow: 'hidden',
            },
          },
          root: {
            sx: {
              '& .MuiMenu-list': { py: 0, display: 'flex', flexDirection: 'column' },
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
        <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: 520 }}>
          {/* 顶部：Auto 选项 + 分割线 + 分组标题 */}
          <Box sx={{ flexShrink: 0, pt: 0.5 }}>
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
          </Box>

          {/* 中间：可滚动的模型列表 */}
          <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
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
                      <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        {providerIcon(option.provider, 18)}
                      </Box>
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
                      {isSelected && (
                        <CheckIcon sx={{ fontSize: 18, color: ACCENT, flexShrink: 0 }} />
                      )}
                    </Box>
                  </MenuItem>
                );
              })}

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
          </Box>

          {/* 底部：固定的添加模型按钮 */}
          <Box sx={{ flexShrink: 0, pb: 0.5, pt: 0.5, bgcolor: gs.bgPanel, borderTop: `1px solid ${gs.border}` }}>
            <MenuItem
              onClick={() => { setActiveDropdown(null); onOpenAISettings?.(); }}
              sx={{ py: 1, mx: 0.5, borderRadius: '10px', '&:hover': { bgcolor: isDark ? '#2A2A2A' : '#F5F5F5' } }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                <SettingsIcon sx={{ fontSize: 16, color: gs.textMuted }} />
              </ListItemIcon>
              <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted }}>添加模型</Typography>
            </MenuItem>
          </Box>
        </Box>
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
          const activeSkills = getAllSkillsSortedByUsage().filter(s => s.status === 'active');
          const result: React.ReactNode[] = [];
          const displaySkills = activeSkills.slice(0, 8);
          for (const skill of displaySkills) {
            result.push(
              <MenuItem
                key={skill.id}
                onClick={() => { onSkillSelect(skill); setActiveDropdown(null); }}
                sx={{ py: 0.75, px: 2, mx: 0.5, borderRadius: '8px', '&:hover': { bgcolor: isDark ? '#2A2A2A' : '#F5F5F5' } }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 18 }} />}
                </ListItemIcon>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.8125rem', color: gs.textPrimary }}>{skill.name}</Typography>
                </Box>
              </MenuItem>
            );
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
