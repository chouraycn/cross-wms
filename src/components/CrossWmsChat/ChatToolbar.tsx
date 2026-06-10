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
  CircularProgress,
  Tooltip,
  Chip,
  useTheme,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import AddIcon from '@mui/icons-material/Add';
import MicIcon from '@mui/icons-material/Mic';
import AppsIcon from '@mui/icons-material/Apps';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SettingsIcon from '@mui/icons-material/Settings';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import StarIcon from '@mui/icons-material/Star';
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
  /** Memory dialog open handler */
  onOpenMemory: () => void;
  /** Skill select handler */
  onSkillSelect: (skill: Skill) => void;
  /** Available model options with provider info */
  modelOptions: ModelOption[];
  /** Current preset ID */
  selectedPreset: string;
  /** Callback when user picks a preset */
  onPresetChange: (presetId: string) => void;
}

// ===================== Constants =====================

const CRAFT_OPTIONS = ['创建文档', '创建表格', '创建演示'];
const PERMISSION_OPTIONS = ['公开', '仅自己', '团队成员'];

  /** 模型参数预设选项 */
  const PRESET_OPTIONS = [
    { id: '', label: '默认', description: '使用模型默认参数' },
    { id: 'creative', label: '创意写作', description: '温度 1.3，适合创意、头脑风暴' },
    { id: 'code', label: '代码生成', description: '温度 0.2，确保代码准确性' },
    { id: 'translate', label: '翻译', description: '温度 0.3，保持翻译一致性' },
    { id: 'analysis', label: '分析推理', description: '温度 0.5，适合逻辑分析' },
    { id: 'precise', label: '精确问答', description: '温度 0.1，追求事实准确性' },
  ];

type DropdownType = 'craft' | 'model' | 'skills' | 'permission' | 'preset' | null;

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
  onOpenMemory,
  onSkillSelect,
  modelOptions,
  selectedPreset,
  onPresetChange,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const SECONDARY = gs.textMuted;
  const navigate = useNavigate();
  const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);

  const craftBtnRef = useRef<HTMLButtonElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const permissionBtnRef = useRef<HTMLButtonElement>(null);
  const skillsBtnRef = useRef<HTMLButtonElement>(null);
  const presetBtnRef = useRef<HTMLButtonElement>(null);

  const handleDropdownClick = (type: DropdownType) => {
    setActiveDropdown(prev => prev === type ? null : type);
  };

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          bgcolor: gs.bgPanel,
          flexShrink: 0,
        }}
      >
        {/* Left buttons: Craft, Model, Skills, Permission */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Craft button */}
          <IconButton
            ref={craftBtnRef}
            size="small"
            onClick={(e) => { e.stopPropagation(); handleDropdownClick('craft'); }}
            sx={{
              width: 32, height: 32, borderRadius: '8px', p: 0, ml: 1.25,
              color: SECONDARY, bgcolor: 'transparent', '&:hover': { bgcolor: gs.bgHover },
            }}
          >
            <Typography sx={{ fontSize: 12, fontWeight: 500 }}>Craft</Typography>
            <ArrowDropDownIcon sx={{ fontSize: 16, ml: 0.25 }} />
          </IconButton>

          {/* Model selector */}
          <IconButton
            ref={modelBtnRef}
            size="small"
            onClick={(e) => { e.stopPropagation(); handleDropdownClick('model'); }}
            sx={{
              width: 'auto', height: 32, borderRadius: '8px', px: 1,
              color: SECONDARY, bgcolor: 'transparent', '&:hover': { bgcolor: gs.bgHover },
            }}
          >
            <Typography sx={{ fontSize: 12, fontWeight: 500 }}>{selectedModel}</Typography>
            <ArrowDropDownIcon sx={{ fontSize: 16, ml: 0.25 }} />
          </IconButton>

          {/* Skills button */}
          <IconButton
            ref={skillsBtnRef}
            size="small"
            onClick={(e) => { e.stopPropagation(); handleDropdownClick('skills'); }}
            sx={{
              width: 'auto', height: 32, borderRadius: '8px', px: 1,
              color: SECONDARY, bgcolor: 'transparent', '&:hover': { bgcolor: gs.bgHover },
            }}
          >
            <Typography sx={{ fontSize: 12, fontWeight: 500 }}>Skills</Typography>
          </IconButton>

          {/* Permission button */}
          <IconButton
            ref={permissionBtnRef}
            size="small"
            onClick={(e) => { e.stopPropagation(); handleDropdownClick('permission'); }}
            sx={{
              width: 'auto', height: 32, borderRadius: '8px', px: 1,
              color: SECONDARY, bgcolor: 'transparent', '&:hover': { bgcolor: gs.bgHover },
            }}
          >
            <Typography sx={{ fontSize: 12, fontWeight: 500 }}>{selectedPermission}</Typography>
            <ArrowDropDownIcon sx={{ fontSize: 16, ml: 0.25 }} />
          </IconButton>

          {/* Preset button (参数预设) */}
          <IconButton
            ref={presetBtnRef}
            size="small"
            onClick={(e) => { e.stopPropagation(); handleDropdownClick('preset'); }}
            sx={{
              width: 'auto', height: 32, borderRadius: '8px', px: 1,
              color: selectedPreset ? '#2563EB' : SECONDARY,
              bgcolor: selectedPreset ? (isDark ? '#1E3A8A' : '#EFF6FF') : 'transparent',
              '&:hover': { bgcolor: selectedPreset ? (isDark ? '#1E40AF' : '#DBEAFE') : gs.bgHover },
            }}
          >
            <TuneIcon sx={{ fontSize: 16, mr: 0.25 }} />
            <Typography sx={{ fontSize: 12, fontWeight: 500 }}>
              {selectedPreset ? PRESET_OPTIONS.find(p => p.id === selectedPreset)?.label || '预设' : '预设'}
            </Typography>
            <ArrowDropDownIcon sx={{ fontSize: 16, ml: 0.25 }} />
          </IconButton>
        </Box>

        {/* Right buttons: Memory, Add, Voice, Send */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Memory button */}
          <Tooltip title="记忆 (MEMORY.md)">
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onOpenMemory(); }}
              sx={{
                width: 32, height: 32, borderRadius: '8px', p: 0,
                color: SECONDARY, bgcolor: 'transparent', '&:hover': { bgcolor: gs.bgHover },
              }}
            >
              <PsychologyIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>

          {/* Add button */}
          <IconButton
            size="small"
            onClick={(e) => e.stopPropagation()}
            sx={{
              width: 32, height: 32, borderRadius: '8px', p: 0,
              color: SECONDARY, bgcolor: 'transparent', '&:hover': { bgcolor: gs.bgHover },
            }}
          >
            <AddIcon sx={{ fontSize: 20 }} />
          </IconButton>

          {/* Voice button */}
          <IconButton
            size="small"
            onClick={(e) => e.stopPropagation()}
            sx={{
              width: 32, height: 32, borderRadius: '8px', p: 0,
              color: SECONDARY, bgcolor: 'transparent', '&:hover': { bgcolor: gs.bgHover },
            }}
          >
            <MicIcon sx={{ fontSize: 20 }} />
          </IconButton>

          {/* Send / Stop button */}
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
              width: 32, height: 32, borderRadius: '50%', p: 0,
              bgcolor: isLoading ? '#EF4444' : '#f97316',
              color: '#fff',
              flexShrink: 0,
              border: 'none',
              '&:hover': { bgcolor: isLoading ? '#DC2626' : '#ea580c' },
              '&.Mui-disabled': { bgcolor: gs.border, color: gs.textDisabled },
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

      {/* MUI Menu: Craft */}
      <Menu
        anchorEl={craftBtnRef.current}
        open={activeDropdown === 'craft'}
        onClose={() => setActiveDropdown(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        sx={{ mb: 0.5 }}
      >
        {CRAFT_OPTIONS.map((option) => (
          <MenuItem key={option} onClick={() => setActiveDropdown(null)}>
            {option}
          </MenuItem>
        ))}
      </Menu>

      {/* MUI Menu: Model — 增强版，展示能力标签、描述、上下文窗口 */}
      <Menu
        anchorEl={modelBtnRef.current}
        open={activeDropdown === 'model'}
        onClose={() => setActiveDropdown(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { width: 360, maxHeight: 480 } }}
        sx={{ mb: 0.5 }}
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
                py: 1.25, px: 2,
                backgroundColor: isSelected ? '#EFF6FF' : 'transparent',
                borderLeft: isSelected ? '3px solid #2563EB' : '3px solid transparent',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, width: '100%' }}>
                <AutoModeIcon sx={{ fontSize: 20, color: '#2563EB', flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: isSelected ? '#2563EB' : '#111827' }}>
                      Auto
                    </Typography>
                    <Chip label="智能" size="small" sx={{ fontSize: '0.6rem', height: 16, backgroundColor: '#DBEAFE', color: '#2563EB', fontWeight: 600 }} />
                  </Box>
                  <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', mt: 0.25 }}>
                    根据任务自动选择最合适的模型
                  </Typography>
                </Box>
                {isSelected && <StarIcon sx={{ fontSize: 14, color: '#2563EB' }} />}
              </Box>
            </MenuItem>
          );
        })()}

        <Divider sx={{ my: 0.5 }} />

        {/* 按 Provider 分组标题 */}
        <Typography sx={{ px: 2, py: 0.5, fontSize: '0.65rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
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
                  py: 1, px: 2,
                  backgroundColor: isSelected ? '#EFF6FF' : 'transparent',
                  borderLeft: isSelected ? '3px solid #2563EB' : '3px solid transparent',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, width: '100%' }}>
                  {/* Provider 图标 */}
                  <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, pt: 0.25 }}>
                    {providerIcon(option.provider, 16)}
                  </Box>

                  {/* 模型信息 */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* 第一行：名称 + 默认标记 */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography sx={{
                        fontSize: '0.8125rem',
                        fontWeight: isSelected ? 600 : 500,
                        color: isSelected ? '#2563EB' : '#111827',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {option.name}
                      </Typography>
                      {option.isDefault && (
                        <Chip label="默认" size="small" sx={{ fontSize: '0.55rem', height: 14, backgroundColor: '#FEF3C7', color: '#D97706', fontWeight: 600 }} />
                      )}
                      {isSelected && <StarIcon sx={{ fontSize: 12, color: '#2563EB', ml: 'auto' }} />}
                    </Box>

                    {/* 第二行：描述 */}
                    {option.description && (
                      <Typography sx={{
                        fontSize: '0.7rem',
                        color: '#9CA3AF',
                        mt: 0.25,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {option.description}
                      </Typography>
                    )}

                    {/* 第三行：能力标签 + 上下文窗口 */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                      {option.capabilities?.map(cap => (
                        <Chip
                          key={cap}
                          label={CAPABILITY_LABELS[cap]}
                          size="small"
                          sx={{
                            fontSize: '0.55rem',
                            height: 14,
                            backgroundColor: `${CAPABILITY_COLORS[cap]}12`,
                            color: CAPABILITY_COLORS[cap],
                            fontWeight: 500,
                            maxWidth: 'none',
                          }}
                        />
                      ))}
                      {option.contextWindow != null && (
                        <Typography sx={{ fontSize: '0.6rem', color: '#C0C4CC' }}>
                          {option.contextWindow >= 1000 ? `${Math.round(option.contextWindow / 1000)}K` : option.contextWindow} ctx
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Box>
              </MenuItem>
            );
          })}

        <Divider sx={{ my: 0.5 }} />

        {/* 管理模型入口 */}
        <MenuItem
          onClick={() => { setActiveDropdown(null); navigate('/settings?tab=modelManagement'); }}
          sx={{ py: 0.75 }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <SettingsIcon sx={{ fontSize: 16, color: '#6B7280' }} />
          </ListItemIcon>
          <Typography sx={{ fontSize: '0.8rem', color: '#6B7280' }}>管理模型 →</Typography>
        </MenuItem>
      </Menu>

      {/* MUI Menu: Skills — 按分类分组显示 active 技能 */}
      <Menu
        anchorEl={skillsBtnRef.current}
        open={activeDropdown === 'skills'}
        onClose={() => setActiveDropdown(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { width: 300, maxHeight: 420 } }}
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
              <Typography key={`cat-${cat}`} sx={{ px: 2, py: 0.5, fontSize: '0.65rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
                {getCategoryLabel(cat)}
              </Typography>
            );
            for (const skill of items.slice(0, 4)) {
              result.push(
                <MenuItem key={skill.id} onClick={() => { onSkillSelect(skill); setActiveDropdown(null); }} sx={{ py: 0.75, px: 2 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>{ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 18 }} />}</ListItemIcon>
                  <Typography sx={{ fontSize: '0.8rem' }}>{skill.name}</Typography>
                </MenuItem>
              );
            }
          }
          return result;
        })()}
        <Divider />
        <MenuItem onClick={() => { setActiveDropdown(null); navigate('/skills'); }}>
          <ListItemIcon><AppsIcon sx={{ fontSize: 18, color: '#6B7280' }} /></ListItemIcon>
          <Typography sx={{ fontSize: 13, color: '#6B7280' }}>查看全部技能 →</Typography>
        </MenuItem>
      </Menu>

      {/* MUI Menu: Permission */}
      <Menu
        anchorEl={permissionBtnRef.current}
        open={activeDropdown === 'permission'}
        onClose={() => setActiveDropdown(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        sx={{ mb: 0.5 }}
      >
        {PERMISSION_OPTIONS.map((option) => (
          <MenuItem key={option} onClick={() => { onPermissionChange(option); setActiveDropdown(null); }}>
            {option}
          </MenuItem>
        ))}
      </Menu>

      {/* MUI Menu: Preset (参数预设) */}
      <Menu
        anchorEl={presetBtnRef.current}
        open={activeDropdown === 'preset'}
        onClose={() => setActiveDropdown(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { width: 240 } }}
        sx={{ mb: 0.5 }}
      >
        {PRESET_OPTIONS.map((option) => (
          <MenuItem
            key={option.id}
            onClick={() => { onPresetChange(option.id); setActiveDropdown(null); }}
            sx={{
              py: 1,
              backgroundColor: selectedPreset === option.id ? '#EFF6FF' : 'transparent',
            }}
          >
            <Box sx={{ width: '100%' }}>
              <Typography sx={{
                fontSize: '0.8125rem',
                fontWeight: selectedPreset === option.id ? 600 : 400,
                color: selectedPreset === option.id ? '#2563EB' : '#111827',
              }}>
                {option.label}
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', mt: 0.25 }}>
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
