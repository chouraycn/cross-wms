import React, { useState, useRef, useEffect } from 'react';
import { Paper, List, ListItem, ListItemText, ListItemIcon, Typography, Box, CircularProgress } from '@mui/material';
import { Skill } from '../../types/skill';
import { DEFAULT_SKILLS } from '../../types/skill';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InputIcon from '@mui/icons-material/Input';
import OutputIcon from '@mui/icons-material/Output';
import BarChartIcon from '@mui/icons-material/BarChart';

interface SkillSelectorProps {
  anchorEl: HTMLElement | null;
  onSelect: (skill: Skill) => void;
  onClose: () => void;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  'Analytics': <AnalyticsIcon sx={{ fontSize: 20, color: '#6B7280' }} />,
  'LocalShipping': <LocalShippingIcon sx={{ fontSize: 20, color: '#6B7280' }} />,
  'Input': <InputIcon sx={{ fontSize: 20, color: '#6B7280' }} />,
  'Output': <OutputIcon sx={{ fontSize: 20, color: '#6B7280' }} />,
  'BarChart': <BarChartIcon sx={{ fontSize: 20, color: '#6B7280' }} />,
};

export function SkillSelector({ anchorEl, onSelect, onClose }: SkillSelectorProps) {
  const [filterText, setFilterText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (anchorEl && !anchorEl.contains(e.target as Node) && listRef.current && !listRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [anchorEl, onClose]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const filteredSkills = DEFAULT_SKILLS.filter(skill =>
    skill.name.toLowerCase().includes(filterText.toLowerCase()) ||
    skill.description.toLowerCase().includes(filterText.toLowerCase()) ||
    skill.category.toLowerCase().includes(filterText.toLowerCase())
  );

  if (!anchorEl) return null;

  const anchorRect = anchorEl.getBoundingClientRect();

  return (
    <Paper
      ref={listRef}
      elevation={4}
      sx={{
        position: 'absolute',
        top: anchorRect.bottom + 8,
        left: anchorRect.left,
        width: 320,
        maxHeight: 360,
        overflow: 'auto',
        zIndex: 1400,
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
        bgcolor: '#FFFFFF',
        boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.1)',
      }}
    >
      {filteredSkills.length === 0 ? (
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 13, color: '#9CA3AF' }}>未找到匹配的技能</Typography>
        </Box>
      ) : (
        <List sx={{ py: 0.5, px: 0 }}>
          {filteredSkills.map((skill) => (
            <ListItem
              key={skill.id}
              button
              onClick={() => {
                onSelect(skill);
              }}
              sx={{
                py: 1,
                px: 1.5,
                cursor: 'pointer',
                '&:hover': {
                  bgcolor: '#F3F4F6',
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                {ICON_MAP[skill.icon] || <AnalyticsIcon sx={{ fontSize: 20, color: '#6B7280' }} />}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Typography sx={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>
                    {skill.name}
                  </Typography>
                }
                secondary={
                  <Typography sx={{ fontSize: 11, color: '#9CA3AF', mt: 0.25 }}>
                    {skill.description}
                  </Typography>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}
