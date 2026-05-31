import React, { useState, useRef } from 'react';
import { Box, TextField, IconButton, Paper, Chip, Fade } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { useChat } from '../../hooks/useChat';
import { ChatPanel } from './ChatPanel';
import { Skill } from '../../types/skill';
import { SkillSelector } from './SkillSelector';
import { PRIMARY, SECONDARY, BORDER, BG_LIGHT } from '../../constants/theme';

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
  const [showSkills, setShowSkills] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isLoading, inputValue, setInputValue, sendMessage } = useChat(
    session?.id ? session : undefined,
    onSessionUpdate
  );

  const hasMessages = session.messages.length > 0;

  const handleInputChange = (value: string) => {
    setInputValue(value);
    if (value.endsWith('@') && !showSkills) {
      setShowSkills(true);
    }
  };

  const handleSkillSelect = (skill: Skill) => {
    setSelectedSkill(skill);
    setShowSkills(false);
    setInputValue(prev => prev + `[${skill.name}] `);
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
        {/* 技能选择按钮 */}
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); setShowSkills(!showSkills); }}
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

      {/* 技能选择下拉 */}
      {showSkills && (
        <SkillSelector
          anchorEl={inputRef.current}
          onSelect={handleSkillSelect}
          onClose={() => setShowSkills(false)}
        />
      )}
    </Paper>
  );
}
