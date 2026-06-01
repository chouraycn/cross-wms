import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, TextField, IconButton, Paper, Chip, Fade, Menu, MenuItem, Typography, Divider, ListItemIcon } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import AppsIcon from '@mui/icons-material/Apps';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useChat } from '../../hooks/useChat';
import { ChatPanel } from './ChatPanel';
import { Skill } from '../../types/skill';
import { ICON_MAP } from '../../types/skill';
import { getAllSkills } from '../../stores/skillStore';
import { SkillSelector } from './SkillSelector';
import { PRIMARY, SECONDARY, BORDER, BG_LIGHT } from '../../constants/theme';

const categoryLabels: Record<string, string> = { core: '核心功能', data: '数据管理', auto: '自动化', tool: '工具' };
const categoryOrder = ['core', 'data', 'auto', 'tool'];

interface BottomChatInputProps {
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

export function BottomChatInput({ session, onSessionUpdate }: BottomChatInputProps) {
  const navigate = useNavigate();
  const [showSkills, setShowSkills] = useState(false);
  const [showSkillSelector, setShowSkillSelector] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [skillsMenuAnchor, setSkillsMenuAnchor] = useState<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isLoading, inputValue, setInputValue, sendMessage } = useChat(
    session?.id ? session : undefined,
    onSessionUpdate
  );

  const hasMessages = session.messages.length > 0;

  const handleInputChange = (value: string) => {
    setInputValue(value);

    // 斜杠命令检测
    if (value.startsWith('/')) {
      const query = value.slice(1).trim();
      setSlashQuery(query);
      setShowSkillSelector(true);
    } else if (value.endsWith('@')) {
      setShowSkills(true);
      setShowSkillSelector(false);
    } else {
      setShowSkillSelector(false);
      setShowSkills(false);
    }
  };

  const handleSkillSelect = (skill: Skill) => {
    setSelectedSkill(skill);
    setShowSkills(false);
    setShowSkillSelector(false);
    setSkillsMenuAnchor(null);
    // 如果是斜杠命令选择，替换整个输入内容
    if (inputValue.startsWith('/')) {
      setInputValue(`[${skill.name}] `);
    } else {
      setInputValue(prev => prev + `[${skill.name}] `);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    sendMessage(inputValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Paper
      elevation={0}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        // 在文档流中自然排列，由父容器 margin-top:auto 控制沉底
        width: '100%',
        borderTop: `1px solid ${BORDER}`,
        bgcolor: '#fff',
      }}
    >
      {/* 消息区 - 悬停时显示在输入栏上方（文档流内） */}
      <Fade in={isHovered && hasMessages} timeout={180}>
        <Box
          sx={{
            maxHeight: 360,
            overflow: 'auto',
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <Box sx={{ p: 1.5 }}>
            <ChatPanel
              messages={session.messages}
              isLoading={isLoading}
              inputValue={inputValue}
              onInputChange={setInputValue}
              onSend={handleSend}
              compact
            />
          </Box>
        </Box>
      </Fade>

      {/* 已选技能标签 */}
      {selectedSkill && (
        <Box sx={{ px: 2, py: 0.5, bgcolor: '#fff', borderBottom: `1px solid ${BORDER}` }}>
          <Chip
            label={selectedSkill.name}
            onDelete={() => setSelectedSkill(null)}
            size="small"
            sx={{ height: 24, fontSize: 12 }}
          />
        </Box>
      )}

      {/* 输入栏 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          bgcolor: isHovered ? '#fff' : BG_LIGHT,
          transition: 'background-color 0.2s ease',
        }}
      >
        {/* 技能选择按钮 — 点击弹出下拉菜单 */}
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); setSkillsMenuAnchor(e.currentTarget); }}
          sx={{
            p: 0.5,
            color: selectedSkill ? PRIMARY : SECONDARY,
            bgcolor: selectedSkill ? 'rgba(17,24,39,0.08)' : 'transparent',
            borderRadius: 8,
            '&:hover': { bgcolor: 'rgba(0,0,0,0.06)' },
          }}
        >
          <ArrowDropDownIcon sx={{ fontSize: 20 }} />
        </IconButton>

        {/* 输入框 */}
        <TextField
          inputRef={inputRef}
          size="small"
          fullWidth
          placeholder={hasMessages ? "继续提问..." : "输入消息或 @ 选择技能..."}
          value={inputValue}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          InputProps={{
            style: { fontSize: 13, height: 36, borderRadius: 8 },
          }}
          sx={{
            '& .MuiInputBase-root': {
              bgcolor: '#fff',
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              '&:focus-within': { borderColor: PRIMARY },
            },
          }}
        />

        {/* 发送按钮 */}
        <IconButton
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading}
          sx={{
            bgcolor: PRIMARY,
            color: '#fff',
            borderRadius: 8,
            width: 36,
            height: 36,
            flexShrink: 0,
            '&:hover': { bgcolor: '#374151' },
            '&.Mui-disabled': { bgcolor: BORDER },
          }}
        >
          <SendIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* 技能下拉菜单：按分类分组显示 active 技能 */}
      <Menu
        anchorEl={skillsMenuAnchor}
        open={!!skillsMenuAnchor}
        onClose={() => setSkillsMenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
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
                <MenuItem key={skill.id} onClick={() => { handleSkillSelect(skill); setSkillsMenuAnchor(null); }} sx={{ py: 0.75, px: 2 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>{ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 18 }} />}</ListItemIcon>
                  <Typography sx={{ fontSize: '0.8rem' }}>{skill.name}</Typography>
                </MenuItem>
              );
            }
          }
          return result;
        })()}
        <Divider />
        <MenuItem onClick={() => { setSkillsMenuAnchor(null); navigate('/skills'); }}>
          <ListItemIcon><AppsIcon sx={{ fontSize: 18, color: '#6B7280' }} /></ListItemIcon>
          <Typography sx={{ fontSize: 13, color: '#6B7280' }}>查看全部技能 →</Typography>
        </MenuItem>
      </Menu>

      {/* 技能选择下拉 — @ 触发 */}
      {showSkills && (
        <SkillSelector
          anchorEl={inputRef.current}
          onSelect={handleSkillSelect}
          onClose={() => setShowSkills(false)}
        />
      )}

      {/* 技能选择下拉 — / 斜杠命令触发 */}
      {showSkillSelector && (
        <SkillSelector
          anchorEl={inputRef.current}
          onSelect={handleSkillSelect}
          onClose={() => setShowSkillSelector(false)}
          initialFilter={slashQuery}
        />
      )}
    </Paper>
  );
}
