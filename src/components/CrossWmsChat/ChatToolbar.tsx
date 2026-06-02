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
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import AddIcon from '@mui/icons-material/Add';
import MicIcon from '@mui/icons-material/Mic';
import AppsIcon from '@mui/icons-material/Apps';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { Skill } from '../../types/skill';
import { ICON_MAP } from '../../types/skill';
import { getAllSkills } from '../../stores/skillStore';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../../constants/skillCategories';
import { SECONDARY } from '../../constants/theme';

// ===================== Types =====================

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
  /** Memory dialog open handler */
  onOpenMemory: () => void;
  /** Skill select handler */
  onSkillSelect: (skill: Skill) => void;
  /** Available model names */
  modelOptions: string[];
}

// ===================== Constants =====================

const CRAFT_OPTIONS = ['创建文档', '创建表格', '创建演示'];
const PERMISSION_OPTIONS = ['公开', '仅自己', '团队成员'];

type DropdownType = 'craft' | 'model' | 'skills' | 'permission' | null;

// ===================== Component =====================

const ChatToolbar: React.FC<ChatToolbarProps> = ({
  selectedModel,
  onModelChange,
  selectedPermission,
  onPermissionChange,
  isLoading,
  inputValue,
  onSend,
  onOpenMemory,
  onSkillSelect,
  modelOptions,
}) => {
  const navigate = useNavigate();
  const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);

  const craftBtnRef = useRef<HTMLButtonElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const permissionBtnRef = useRef<HTMLButtonElement>(null);
  const skillsBtnRef = useRef<HTMLButtonElement>(null);

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
          bgcolor: '#fff',
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
              color: SECONDARY, bgcolor: 'transparent', '&:hover': { bgcolor: '#f5f5f5' },
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
              color: SECONDARY, bgcolor: 'transparent', '&:hover': { bgcolor: '#f5f5f5' },
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
              color: SECONDARY, bgcolor: 'transparent', '&:hover': { bgcolor: '#f5f5f5' },
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
              color: SECONDARY, bgcolor: 'transparent', '&:hover': { bgcolor: '#f5f5f5' },
            }}
          >
            <Typography sx={{ fontSize: 12, fontWeight: 500 }}>{selectedPermission}</Typography>
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
                color: SECONDARY, bgcolor: 'transparent', '&:hover': { bgcolor: '#f5f5f5' },
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
              color: SECONDARY, bgcolor: 'transparent', '&:hover': { bgcolor: '#f5f5f5' },
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
              color: SECONDARY, bgcolor: 'transparent', '&:hover': { bgcolor: '#f5f5f5' },
            }}
          >
            <MicIcon sx={{ fontSize: 20 }} />
          </IconButton>

          {/* Send button */}
          <IconButton
            onClick={(e) => { e.stopPropagation(); onSend(); }}
            disabled={!inputValue.trim() || isLoading}
            sx={{
              width: 32, height: 32, borderRadius: '50%', p: 0,
              bgcolor: '#f97316', color: '#fff', flexShrink: 0, border: 'none',
              '&:hover': { bgcolor: '#ea580c' },
              '&.Mui-disabled': { bgcolor: '#eee', color: '#bbb' },
            }}
          >
            {isLoading ? (
              <CircularProgress size={16} sx={{ color: '#fff' }} />
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

      {/* MUI Menu: Model */}
      <Menu
        anchorEl={modelBtnRef.current}
        open={activeDropdown === 'model'}
        onClose={() => setActiveDropdown(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        sx={{ mb: 0.5 }}
      >
        {modelOptions.map((option) => (
          <MenuItem key={option} onClick={() => { onModelChange(option); setActiveDropdown(null); }}>
            {option}
          </MenuItem>
        ))}
        <MenuItem component="div" divider sx={{ mx: 0, my: 0.5, pointerEvents: 'none' }} />
        <MenuItem onClick={() => setActiveDropdown(null)}>
          添加模型
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
                {CATEGORY_LABELS[cat]}
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
    </>
  );
};

export default ChatToolbar;
