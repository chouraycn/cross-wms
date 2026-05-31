import React, { useState, useRef, useEffect } from 'react';
import { Box, TextField, IconButton, Paper, Typography, Chip } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { useChat } from '../../hooks/useChat';
import { ChatPanel } from './ChatPanel';
import { Skill, DEFAULT_SKILLS } from '../../types/skill';
import { SkillSelector } from './SkillSelector';

// 极简黑白灰配色
const PRIMARY = '#111827';
const SECONDARY = '#6B7280';
const BORDER = '#E5E7EB';
const BG_LIGHT = '#F3F4F6';
const RADIUS = 6;

interface TopBarChatInputProps {
  session: { 
    id: string; 
    title: string; 
    model: string; 
    messages: { 
      id: string; 
      role: 'user' | 'assistant'; 
      content: string; 
      timestamp: Date 
    }[] 
  };
  onSessionUpdate: (session: any) => void;
}

export function TopBarChatInput({ session, onSessionUpdate }: TopBarChatInputProps) {
  const [expanded, setExpanded] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { isLoading, sendMessage } = useChat(
    session.id ? session : undefined,
    onSessionUpdate
  );

  const handleFocus = () => {
    if (inputValue.trim() || selectedSkill) {
      setExpanded(true);
    }
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    if (value.endsWith('@') && !showSkills) {
      setShowSkills(true);
    }
    if (value.trim() && !expanded) {
      setExpanded(true);
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
    setInputValue('');
    setExpanded(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box sx={{ position: 'relative', width: 350, zIndex: 1300 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <TextField
          inputRef={inputRef}
          size="small"
          fullWidth
          placeholder="输入消息或 @ 选择技能..."
          value={inputValue}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          InputProps={{
            endAdornment: (
              <IconButton size="small" onClick={() => setShowSkills(!showSkills)} sx={{ p: 0.25 }}>
                <ArrowDropDownIcon sx={{ fontSize: 20, color: SECONDARY }} />
              </IconButton>
            ),
            style: { fontSize: 13, height: 36, borderRadius: RADIUS }
          }}
          sx={{
            '& .MuiInputBase-root': {
              bgcolor: BG_LIGHT,
              border: `1px solid ${BORDER}`,
              borderRadius: RADIUS,
              '&:focus-within': { borderColor: PRIMARY, bgcolor: '#fff' }
            }
          }}
        />
        {expanded && (
          <IconButton
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            sx={{
              bgcolor: PRIMARY,
              color: '#fff',
              borderRadius: RADIUS,
              width: 36,
              height: 36,
              '&:hover': { bgcolor: '#374151' },
              '&.Mui-disabled': { bgcolor: BORDER }
            }}
          >
            <SendIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
      </Box>

      {selectedSkill && (
        <Chip
          label={selectedSkill.name}
          onDelete={() => setSelectedSkill(null)}
          size="small"
          sx={{ mt: 0.5, height: 24, fontSize: 12 }}
        />
      )}

      {showSkills && (
        <SkillSelector
          anchorEl={inputRef.current}
          onSelect={handleSkillSelect}
          onClose={() => setShowSkills(false)}
        />
      )}

      {expanded && session.messages.length > 0 && (
        <Paper
          sx={{
            position: 'absolute',
            top: '100%',
            right: 0,
            width: 400,
            maxHeight: 500,
            overflow: 'auto',
            mt: 0.5,
            zIndex: 1400,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            borderRadius: RADIUS,
          }}
        >
          <ChatPanel
            messages={session.messages}
            isLoading={isLoading}
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSend={handleSend}
          />
        </Paper>
      )}
    </Box>
  );
}
