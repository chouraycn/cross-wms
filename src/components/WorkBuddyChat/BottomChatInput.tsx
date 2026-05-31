import React, { useState, useRef } from 'react';
import { Box, TextField, IconButton, Paper, Chip, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { useChat } from '../../hooks/useChat';
import { ChatPanel } from './ChatPanel';
import { Skill, DEFAULT_SKILLS } from '../../types/skill';
import { SkillSelector } from './SkillSelector';
import { PRIMARY, SECONDARY, BORDER, BG_LIGHT, RADIUS } from '../../constants/theme';

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
  const [expanded, setExpanded] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isLoading, inputValue, setInputValue, sendMessage } = useChat(
    session.id ? session : undefined,
    onSessionUpdate
  );

  const handleInputChange = (value: string) => {
    setInputValue(value);
    if (value.endsWith('@') && !showSkills) {
      setShowSkills(true);
    }
  };

  const handleSkillSelect = (skill: Skill) => {
    setSelectedSkill(skill);
    setShowSkills(false);
    setExpanded(true);
    setInputValue(prev => prev + `[${skill.name}] `);
  };

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    sendMessage(inputValue);
    // Keep expanded after sending to show response
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleToggle = () => {
    if (expanded) {
      // Collapse if no messages
      if (session.messages.length === 0) {
        setExpanded(false);
      }
    } else {
      setExpanded(true);
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        position: 'sticky',
        bottom: 0,
        width: '100%',
        borderTop: `1px solid ${BORDER}`,
        bgcolor: '#fff',
        borderRadius: 0,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: expanded ? '50vh' : 'auto',
        transition: 'max-height 0.3s ease',
      }}
    >
      {/* 消息区（展开时显示） */}
      {expanded && session.messages.length > 0 && (
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            maxHeight: '35vh',
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

      {/* 输入栏 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          bgcolor: BG_LIGHT,
        }}
      >
        {/* 技能选择按钮 */}
        <IconButton
          size="small"
          onClick={() => setShowSkills(!showSkills)}
          sx={{
            p: 0.5,
            color: selectedSkill ? PRIMARY : SECONDARY,
            bgcolor: selectedSkill ? 'rgba(17,24,39,0.08)' : 'transparent',
            borderRadius: RADIUS,
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
          placeholder="输入消息或 @ 选择技能..."
          value={inputValue}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          InputProps={{
            style: { fontSize: 13, height: 36, borderRadius: RADIUS },
          }}
          sx={{
            '& .MuiInputBase-root': {
              bgcolor: '#fff',
              border: `1px solid ${BORDER}`,
              borderRadius: RADIUS,
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
            borderRadius: RADIUS,
            width: 36,
            height: 36,
            flexShrink: 0,
            '&:hover': { bgcolor: '#374151' },
            '&.Mui-disabled': { bgcolor: BORDER },
          }}
        >
          <SendIcon sx={{ fontSize: 18 }} />
        </IconButton>

        {/* 展开/收起按钮 */}
        {session.messages.length > 0 && (
          <IconButton
            size="small"
            onClick={handleToggle}
            sx={{
              p: 0.5,
              color: SECONDARY,
              borderRadius: RADIUS,
              '&:hover': { bgcolor: 'rgba(0,0,0,0.06)' },
            }}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 500 }}>
              {expanded ? '收起' : '展开'}
            </Typography>
          </IconButton>
        )}
      </Box>

      {/* 已选技能标签 */}
      {selectedSkill && (
        <Box sx={{ px: 2, py: 0.5, bgcolor: '#fff' }}>
          <Chip
            label={selectedSkill.name}
            onDelete={() => setSelectedSkill(null)}
            size="small"
            sx={{ height: 24, fontSize: 12 }}
          />
        </Box>
      )}

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
