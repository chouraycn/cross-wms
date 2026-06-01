import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, IconButton, Paper, Chip, CircularProgress, Typography,
  Menu, MenuItem, Divider, ListItemIcon
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import AddIcon from '@mui/icons-material/Add';
import MicIcon from '@mui/icons-material/Mic';
import AppsIcon from '@mui/icons-material/Apps';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useChat } from '../../hooks/useChat';
import { Skill } from '../../types/skill';
import { ICON_MAP } from '../../types/skill';
import { getAllSkills } from '../../stores/skillStore';
import { SkillSelector } from './SkillSelector';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { SECONDARY, BORDER } from '../../constants/theme';

interface TopBarChatInputProps {
  session: {
    id: string;
    title: string;
    model: string;
    messages: {
      id: string;
      role: 'user' | 'assistant';
      content: string;
      timestamp: Date;
    }[];
  };
  onSessionUpdate: (session: any) => void;
}

type DropdownType = 'craft' | 'model' | 'skills' | 'permission' | null;

const CRAFT_OPTIONS = ['创建文档', '创建表格', '创建演示'];
const PERMISSION_OPTIONS = ['公开', '仅自己', '团队成员'];

const categoryLabels: Record<string, string> = { core: '核心功能', data: '数据管理', auto: '自动化', tool: '工具' };
const categoryOrder = ['core', 'data', 'auto', 'tool'];

export function TopBarChatInput({ session, onSessionUpdate }: TopBarChatInputProps) {
  const { settings } = useAppSettings();
  const navigate = useNavigate();
  const [inputExpanded, setInputExpanded] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showSkillSelector, setShowSkillSelector] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);

  // 从 settings 中读取模型列表（仅启用的模型）
  const MODEL_OPTIONS = settings.models.models
    .filter((m) => m.enabled)
    .map((m) => m.name);

  // 初始化选中的模型（优先使用默认模型）
  const [selectedModel, setSelectedModel] = useState(() => {
    const defaultModel = settings.models.models.find((m) => m.id === settings.models.defaultModelId);
    return defaultModel?.name || MODEL_OPTIONS[0] || 'GPT-4';
  });
  const [selectedPermission, setSelectedPermission] = useState('默认权限');

  const editableRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const craftBtnRef = useRef<HTMLButtonElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const permissionBtnRef = useRef<HTMLButtonElement>(null);
  const skillsBtnRef = useRef<HTMLButtonElement>(null);

  const { isLoading, sendMessage } = useChat(
    session?.id ? session : undefined,
    onSessionUpdate
  );

  // Click outside to collapse input area - 严格按 chat-input.html 逻辑
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
        setShowSkills(false);
        setShowSkillSelector(false);
        // 点击外部收起输入区，恢复初始状态（按 HTML 逻辑）
        if (!inputValue.trim()) {
          setInputExpanded(false);
          // 清空内容
          if (editableRef.current) {
            editableRef.current.innerHTML = '';
          }
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputValue]);

  const handleInputChange = useCallback(() => {
    const text = editableRef.current?.innerText || '';
    setInputValue(text);

    // 斜杠命令检测
    if (text.startsWith('/')) {
      const query = text.slice(1).trim();
      setSlashQuery(query);
      setShowSkillSelector(true);
    } else if (text.endsWith('@')) {
      setShowSkills(true);
      setShowSkillSelector(false);
    } else {
      setShowSkillSelector(false);
      setShowSkills(false);
    }
  }, []);

  const handleInputClick = () => {
    if (!inputExpanded) {
      setInputExpanded(true);
      setTimeout(() => {
        if (editableRef.current) {
          editableRef.current.focus();
          // Position cursor at the end of content
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editableRef.current);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 0);
    }
  };

  const handleSkillSelect = (skill: Skill) => {
    setSelectedSkill(skill);
    setShowSkills(false);
    setShowSkillSelector(false);
    if (editableRef.current) {
      // 如果是斜杠命令选择，替换整个输入内容
      if (inputValue.startsWith('/')) {
        editableRef.current.innerText = `[${skill.name}] `;
      } else {
        editableRef.current.innerText += `[${skill.name}] `;
      }
      setInputValue(editableRef.current.innerText);
      setTimeout(() => {
        if (editableRef.current) {
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editableRef.current);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 0);
    }
  };

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    sendMessage(inputValue);
    // Clear the contentEditable div
    if (editableRef.current) {
      editableRef.current.innerHTML = '';
    }
    setInputValue('');
    setShowSkillSelector(false);
    // 发送后收起输入区（按 HTML 逻辑：无内容时恢复初始状态）
    setInputExpanded(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDropdownClick = (type: DropdownType, ref: React.RefObject<HTMLButtonElement>) => {
    if (activeDropdown === type) {
      setActiveDropdown(null);
    } else {
      setActiveDropdown(type);
    }
  };

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        pr: 1.25,
      }}
    >
      {/* 严格按 chat-input.html .chat-container 结构：始终渲染，toolbar 始终可见 */}
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          borderRadius: '12px',
          border: '1px solid #eee',
          bgcolor: '#fff',
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(70vh - 60px)',
          overflow: 'auto',
        }}
      >
        {/* Selected skill tag */}
        {selectedSkill && (
          <Box sx={{ px: 1.5, py: 0.5, bgcolor: '#fff', borderBottom: `1px solid #eee` }}>
            <Chip
              label={selectedSkill.name}
              onDelete={() => setSelectedSkill(null)}
              size="small"
              sx={{ height: 24, fontSize: 12 }}
            />
          </Box>
        )}

        {/* Input area - 严格按 chat-input.html .input-area 样式 */}
        <Box
          onClick={handleInputClick}
          sx={{
            padding: inputExpanded ? '12px 16px' : '8px 16px',
            minHeight: inputExpanded ? 80 : 32,
            display: 'flex',
            flexDirection: 'column',
            cursor: 'text',
            justifyContent: inputExpanded ? 'flex-start' : 'center',
          }}
        >
          {!inputExpanded ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
              {/* 左侧占位，与 toolbar 的 Craft 按钮对齐 */}
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography sx={{ fontSize: 15, color: '#999', lineHeight: 1.4 }}>
                  今天帮你做些什么？
                </Typography>
                <Typography sx={{ fontSize: 13, color: '#bbb', lineHeight: 1.4 }}>
                  @ 引用对话文件，/ 调用技能与指令
                </Typography>
              </Box>
            </Box>
          ) : (
            <>
              <div
                ref={editableRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInputChange}
                onKeyDown={handleKeyDown}
                style={{
                  fontSize: 15,
                  lineHeight: 1.5,
                  minHeight: 60,
                  outline: 'none',
                  color: '#333',
                  width: '100%',
                  wordBreak: 'break-word',
                  marginBottom: 8,
                  whiteSpace: 'pre-wrap',
                }}
              />
              {!inputValue.trim() && (
                <div style={{
                  fontSize: 13,
                  color: '#bbb',
                  lineHeight: 1.4,
                }}>
                  @ 引用对话文件，/ 调用技能与指令
                </div>
              )}
            </>
          )}
        </Box>

        {/* Toolbar - 严格按 chat-input.html: background:#fff, padding:8px 16px，始终可见 */}
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
            {/* Craft button - 整体右移 10px */}
            <IconButton
              ref={craftBtnRef}
              size="small"
              onClick={(e) => { e.stopPropagation(); handleDropdownClick('craft', craftBtnRef); }}
              sx={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                p: 0,
                ml: 1.25,
                color: SECONDARY,
                bgcolor: 'transparent',
                '&:hover': { bgcolor: '#f5f5f5' },
              }}
            >
              <Typography sx={{ fontSize: 12, fontWeight: 500 }}>Craft</Typography>
              <ArrowDropDownIcon sx={{ fontSize: 16, ml: 0.25 }} />
            </IconButton>

            {/* Model selector */}
            <IconButton
              ref={modelBtnRef}
              size="small"
              onClick={(e) => { e.stopPropagation(); handleDropdownClick('model', modelBtnRef); }}
              sx={{
                width: 'auto',
                height: 32,
                borderRadius: '8px',
                px: 1,
                color: SECONDARY,
                bgcolor: 'transparent',
                '&:hover': { bgcolor: '#f5f5f5' },
              }}
            >
              <Typography sx={{ fontSize: 12, fontWeight: 500 }}>{selectedModel}</Typography>
              <ArrowDropDownIcon sx={{ fontSize: 16, ml: 0.25 }} />
            </IconButton>

            {/* Skills button — 点击弹出下拉菜单 */}
            <IconButton
              ref={skillsBtnRef}
              size="small"
              onClick={(e) => { e.stopPropagation(); handleDropdownClick('skills', skillsBtnRef); }}
              sx={{
                width: 'auto',
                height: 32,
                borderRadius: '8px',
                px: 1,
                color: SECONDARY,
                bgcolor: 'transparent',
                '&:hover': { bgcolor: '#f5f5f5' },
              }}
            >
              <Typography sx={{ fontSize: 12, fontWeight: 500 }}>Skills</Typography>
            </IconButton>

            {/* Permission button */}
            <IconButton
              ref={permissionBtnRef}
              size="small"
              onClick={(e) => { e.stopPropagation(); handleDropdownClick('permission', permissionBtnRef); }}
              sx={{
                width: 'auto',
                height: 32,
                borderRadius: '8px',
                px: 1,
                color: SECONDARY,
                bgcolor: 'transparent',
                '&:hover': { bgcolor: '#f5f5f5' },
              }}
            >
              <Typography sx={{ fontSize: 12, fontWeight: 500 }}>{selectedPermission}</Typography>
              <ArrowDropDownIcon sx={{ fontSize: 16, ml: 0.25 }} />
            </IconButton>
          </Box>

          {/* Right buttons: Add, Voice, Send */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Add button */}
            <IconButton
              size="small"
              onClick={(e) => e.stopPropagation()}
              sx={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                p: 0,
                color: SECONDARY,
                bgcolor: 'transparent',
                '&:hover': { bgcolor: '#f5f5f5' },
              }}
            >
              <AddIcon sx={{ fontSize: 20 }} />
            </IconButton>

            {/* Voice button */}
            <IconButton
              size="small"
              onClick={(e) => e.stopPropagation()}
              sx={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                p: 0,
                color: SECONDARY,
                bgcolor: 'transparent',
                '&:hover': { bgcolor: '#f5f5f5' },
              }}
            >
              <MicIcon sx={{ fontSize: 20 }} />
            </IconButton>

            {/* Send button - 橙色主题 */}
            <IconButton
              onClick={(e) => { e.stopPropagation(); handleSend(); }}
              disabled={!inputValue.trim() || isLoading}
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                p: 0,
                bgcolor: '#f97316',
                color: '#fff',
                flexShrink: 0,
                border: 'none',
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

        {/* MUI Menu: Craft - 上方弹出 */}
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

        {/* MUI Menu: Model - 上方弹出 */}
        <Menu
          anchorEl={modelBtnRef.current}
          open={activeDropdown === 'model'}
          onClose={() => setActiveDropdown(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          sx={{ mb: 0.5 }}
        >
          {MODEL_OPTIONS.map((option) => (
            <MenuItem key={option} onClick={() => { setSelectedModel(option); setActiveDropdown(null); }}>
              {option}
            </MenuItem>
          ))}
          <MenuItem component="div" divider sx={{ mx: 0, my: 0.5, pointerEvents: 'none' }} />
          <MenuItem onClick={() => setActiveDropdown(null)}>
            添加模型
          </MenuItem>
        </Menu>

        {/* MUI Menu: Skills - 按分类分组显示 active 技能 */}
        <Menu
          anchorEl={skillsBtnRef.current}
          open={activeDropdown === 'skills'}
          onClose={() => setActiveDropdown(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          PaperProps={{ sx: { width: 300, maxHeight: 420 } }}
        >
          {/* 按分类分组显示 active 技能 */}
          {(() => {
            const activeSkills = getAllSkills().filter(s => s.status === 'active');
            const grouped: Record<string, Skill[]> = {};
            for (const s of activeSkills) {
              if (!grouped[s.category]) grouped[s.category] = [];
              grouped[s.category].push(s);
            }
            const result: React.ReactNode[] = [];
            for (const cat of categoryOrder) {
              const items = grouped[cat];
              if (!items || items.length === 0) continue;
              result.push(
                <Typography key={`cat-${cat}`} sx={{ px: 2, py: 0.5, fontSize: '0.65rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
                  {categoryLabels[cat]}
                </Typography>
              );
              for (const skill of items.slice(0, 4)) {
                result.push(
                  <MenuItem key={skill.id} onClick={() => { handleSkillSelect(skill); setActiveDropdown(null); }} sx={{ py: 0.75, px: 2 }}>
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

        {/* MUI Menu: Permission - 上方弹出 */}
        <Menu
          anchorEl={permissionBtnRef.current}
          open={activeDropdown === 'permission'}
          onClose={() => setActiveDropdown(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          sx={{ mb: 0.5 }}
        >
          {PERMISSION_OPTIONS.map((option) => (
            <MenuItem key={option} onClick={() => { setSelectedPermission(option); setActiveDropdown(null); }}>
              {option}
            </MenuItem>
          ))}
        </Menu>
      </Paper>

      {/* Skill selector dropdown — @ 触发 */}
      {showSkills && (
        <SkillSelector
          anchorEl={editableRef.current}
          onSelect={handleSkillSelect}
          onClose={() => setShowSkills(false)}
        />
      )}

      {/* Skill selector dropdown — / 斜杠命令触发 */}
      {showSkillSelector && (
        <SkillSelector
          anchorEl={editableRef.current}
          onSelect={handleSkillSelect}
          onClose={() => setShowSkillSelector(false)}
          initialFilter={slashQuery}
        />
      )}
    </Box>
  );
}
