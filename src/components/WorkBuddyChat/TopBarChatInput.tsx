import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box, IconButton, Paper, Chip, CircularProgress, Typography,
  Menu, MenuItem
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import AddIcon from '@mui/icons-material/Add';
import MicIcon from '@mui/icons-material/Mic';
import { useChat } from '../../hooks/useChat';
import { ChatPanel } from './ChatPanel';
import { Skill } from '../../types/skill';
import { SkillSelector } from './SkillSelector';
import { PRIMARY, SECONDARY, BORDER, BG_LIGHT } from '../../constants/theme';

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
const MODEL_OPTIONS = ['Hy3 preview', 'GPT-4', 'Claude 3'];
const PERMISSION_OPTIONS = ['公开', '仅自己', '团队成员'];

export function TopBarChatInput({ session, onSessionUpdate }: TopBarChatInputProps) {
  const [expanded, setExpanded] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);
  const [isExpandedInput, setIsExpandedInput] = useState(false);
  const [selectedModel, setSelectedModel] = useState('Hy3 preview');
  const [selectedPermission, setSelectedPermission] = useState('默认权限');

  const editableRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const craftBtnRef = useRef<HTMLButtonElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const permissionBtnRef = useRef<HTMLButtonElement>(null);

  const { isLoading, sendMessage } = useChat(
    session?.id ? session : undefined,
    onSessionUpdate
  );

  const hasMessages = session.messages.length > 0;

  // Auto-expand when there are messages
  useEffect(() => {
    if (hasMessages) {
      setExpanded(true);
    }
  }, [hasMessages]);

  // Click outside to collapse - FIX: Only collapse if NO messages and input is empty
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
        setShowSkills(false);
        // Only collapse if no messages and input is empty
        if (!hasMessages && !inputValue.trim()) {
          setExpanded(false);
          setIsExpandedInput(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [hasMessages, inputValue]);

  const handleInputChange = useCallback(() => {
    const text = editableRef.current?.innerText || '';
    setInputValue(text);
    if (text.endsWith('@') && !showSkills) {
      setShowSkills(true);
    }
    // Auto-expand input area based on content
    if (text.length > 0 && !isExpandedInput) {
      setIsExpandedInput(true);
    }
  }, [showSkills, isExpandedInput]);

  const handleFocus = () => {
    setExpanded(true);
    setTimeout(() => {
      if (editableRef.current) {
        editableRef.current.focus();
        // Position cursor at the end of content
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(editableRef.current);
        range.collapse(false); // false = collapse to end
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }, 0);
  };

  const handleSkillSelect = (skill: Skill) => {
    setSelectedSkill(skill);
    setShowSkills(false);
    if (editableRef.current) {
      editableRef.current.innerText += `[${skill.name}] `;
      setInputValue(editableRef.current.innerText);
      // Reposition cursor after inserted text
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
    setExpanded(true);
    // Clear the contentEditable div
    if (editableRef.current) {
      editableRef.current.innerText = '';
    }
    setInputValue('');
    setIsExpandedInput(false);
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
        width: 400,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Compact input bar - always visible in toolbar */}
      {!expanded && (
        <Box
          onClick={handleFocus}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 0.5,
            width: '100%',
            height: 40,
            bgcolor: BG_LIGHT,
            borderRadius: '12px',
            border: `1px solid ${BORDER}`,
            cursor: 'text',
            transition: 'all 0.2s ease',
            '&:hover': {
              borderColor: PRIMARY,
            },
          }}
        >
          <Typography
            sx={{
              fontSize: 13,
              color: '#9CA3AF',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {inputValue || "今天帮你做些什么？@ 引用对话文件，/ 调用技能与指令"}
          </Typography>
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); setShowSkills(!showSkills); }}
            sx={{
              p: 0.5,
              color: SECONDARY,
              borderRadius: '8px',
              flexShrink: 0,
            }}
          >
            <ArrowDropDownIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      )}

      {/* Expanded chat panel */}
      {expanded && (
        <Paper
          elevation={4}
          sx={{
            width: 400,
            borderRadius: '12px',
            overflow: 'hidden',
            border: `1px solid ${BORDER}`,
            bgcolor: '#FFFFFF',
            zIndex: 1300,
            boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Chat messages area */}
          {hasMessages && (
            <Box
              sx={{
                maxHeight: 400,
                overflow: 'auto',
                borderBottom: `1px solid ${BORDER}`,
              }}
            >
              <ChatPanel
                messages={session.messages}
                isLoading={isLoading}
                inputValue={inputValue}
                onInputChange={setInputValue}
                onSend={handleSend}
                compact
              />
            </Box>
          )}

          {/* Selected skill tag */}
          {selectedSkill && (
            <Box sx={{ px: 1.5, py: 0.5, bgcolor: '#F9FAFB', borderBottom: `1px solid ${BORDER}` }}>
              <Chip
                label={selectedSkill.name}
                onDelete={() => setSelectedSkill(null)}
                size="small"
                sx={{ height: 24, fontSize: 12 }}
              />
            </Box>
          )}

          {/* Input area with contentEditable div */}
          <Box
            sx={{
              minHeight: isExpandedInput ? 80 : 44,
              padding: '10px 16px',
              borderBottom: `1px solid ${BORDER}`,
              bgcolor: '#FFFFFF',
              transition: 'min-height 0.2s ease',
              position: 'relative',
              '&::before': {
                content: editableRef.current?.innerText ? 'none' : '"今天帮你做些什么？@ 引用对话文件，/ 调用技能与指令"',
                position: 'absolute',
                top: '10px',
                left: '16px',
                color: '#9CA3AF',
                fontSize: 13,
                pointerEvents: 'none',
                opacity: editableRef.current?.innerText ? 0 : 1,
              },
            }}
          >
            <div
              ref={editableRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInputChange}
              onFocus={() => setIsExpandedInput(true)}
              onKeyDown={handleKeyDown}
              style={{
                fontSize: 13,
                lineHeight: 1.5,
                minHeight: isExpandedInput ? 60 : 24,
                outline: 'none',
                color: '#111827',
                wordBreak: 'break-word',
              }}
            />
          </Box>

          {/* Toolbar */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 16px',
              bgcolor: '#F9FAFB',
            }}
          >
            {/* Left buttons: Craft, Model, Skills, Permission */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {/* Craft button */}
              <IconButton
                ref={craftBtnRef}
                size="small"
                onClick={() => handleDropdownClick('craft', craftBtnRef)}
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '8px',
                  p: 0,
                  color: SECONDARY,
                  bgcolor: 'transparent',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.06)' },
                }}
              >
                <Typography sx={{ fontSize: 12, fontWeight: 500 }}>Craft</Typography>
                <ArrowDropDownIcon sx={{ fontSize: 16, ml: 0.25 }} />
              </IconButton>

              {/* Model selector */}
              <IconButton
                ref={modelBtnRef}
                size="small"
                onClick={() => handleDropdownClick('model', modelBtnRef)}
                sx={{
                  width: 'auto',
                  height: 32,
                  borderRadius: '8px',
                  px: 1,
                  color: SECONDARY,
                  bgcolor: 'transparent',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.06)' },
                }}
              >
                <Typography sx={{ fontSize: 12, fontWeight: 500 }}>{selectedModel}</Typography>
                <ArrowDropDownIcon sx={{ fontSize: 16, ml: 0.25 }} />
              </IconButton>

              {/* Skills button */}
              <IconButton
                size="small"
                onClick={() => setShowSkills(!showSkills)}
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '8px',
                  p: 0,
                  color: selectedSkill ? PRIMARY : SECONDARY,
                  bgcolor: selectedSkill ? 'rgba(17,24,39,0.08)' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.06)' },
                }}
              >
                <Typography sx={{ fontSize: 12, fontWeight: 500 }}>Skills</Typography>
              </IconButton>

              {/* Permission button */}
              <IconButton
                ref={permissionBtnRef}
                size="small"
                onClick={() => handleDropdownClick('permission', permissionBtnRef)}
                sx={{
                  width: 'auto',
                  height: 32,
                  borderRadius: '8px',
                  px: 1,
                  color: SECONDARY,
                  bgcolor: 'transparent',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.06)' },
                }}
              >
                <Typography sx={{ fontSize: 12, fontWeight: 500 }}>默认权限</Typography>
                <ArrowDropDownIcon sx={{ fontSize: 16, ml: 0.25 }} />
              </IconButton>
            </Box>

            {/* Right buttons: Add, Voice, Send */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {/* Add button */}
              <IconButton
                size="small"
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '8px',
                  p: 0,
                  color: SECONDARY,
                  bgcolor: 'transparent',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.06)' },
                }}
              >
                <AddIcon sx={{ fontSize: 20 }} />
              </IconButton>

              {/* Voice button */}
              <IconButton
                size="small"
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '8px',
                  p: 0,
                  color: SECONDARY,
                  bgcolor: 'transparent',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.06)' },
                }}
              >
                <MicIcon sx={{ fontSize: 20 }} />
              </IconButton>

              {/* Send button - FIXED: Use PRIMARY (#111827) not #333 */}
              <IconButton
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  p: 0,
                  bgcolor: PRIMARY,
                  color: '#fff',
                  flexShrink: 0,
                  '&:hover': { bgcolor: '#374151' },
                  '&.Mui-disabled': { bgcolor: BORDER, color: '#fff' },
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
      )}

      {/* Skill selector dropdown */}
      {showSkills && (
        <SkillSelector
          anchorEl={editableRef.current}
          onSelect={handleSkillSelect}
          onClose={() => setShowSkills(false)}
        />
      )}
    </Box>
  );
}
