import React, { useState, useRef, useEffect } from 'react';
import { Box, Paper, Typography, TextField, List, ListItem, ListItemText, InputAdornment, IconButton } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CloseIcon from '@mui/icons-material/Close';
import { Skill, DEFAULT_SKILLS } from '../../types/skill';
import { PRIMARY, SECONDARY, BORDER, BG_LIGHT, WHITE, RADIUS } from '../../constants/theme';

interface SkillSelectorProps {
  anchorEl: HTMLElement | null;
  onSelect: (skill: Skill) => void;
  onClose: () => void;
}

export function SkillSelector({ anchorEl, onSelect, onClose }: SkillSelectorProps) {
  const [search, setSearch] = useState('');
  const [filtered, setFiltered] = useState<Skill[]>(DEFAULT_SKILLS);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const filtered = DEFAULT_SKILLS.filter(s =>
      s.name.includes(search) || s.description.includes(search)
    );
    setFiltered(filtered);
  }, [search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorEl?.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [anchorEl, onClose]);

  if (!anchorEl) return null;

  const rect = anchorEl.getBoundingClientRect();

  return (
    <Paper
      ref={ref}
      sx={{
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: 320,
        maxHeight: 360,
        overflow: 'auto',
        zIndex: 1400,
        borderRadius: RADIUS,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        bgcolor: WHITE,
      }}
    >
      <Box sx={{ p: 1, borderBottom: `1px solid ${BORDER}` }}>
        <TextField
          size="small"
          fullWidth
          placeholder="搜索技能..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: SECONDARY }} />
              </InputAdornment>
            ),
            endAdornment: search && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearch('')}>
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </InputAdornment>
            ),
            style: { fontSize: 13 }
          }}
          sx={{ '& .MuiInputBase-root': { height: 36 } }}
        />
      </Box>
      <List sx={{ py: 0.5 }}>
        {filtered.map(skill => (
          <ListItem
            key={skill.id}
            button
            onClick={() => { onSelect(skill); setSearch(''); }}
            sx={{ py: 1, px: 2, '&:hover': { bgcolor: BG_LIGHT } }}
          >
            <ListItemText
              primary={skill.name}
              secondary={skill.description}
              primaryTypographyProps={{ fontSize: 14, fontWeight: 500, color: PRIMARY }}
              secondaryTypographyProps={{ fontSize: 12, color: SECONDARY }}
            />
          </ListItem>
        ))}
        {filtered.length === 0 && (
          <Typography sx={{ p: 2, textAlign: 'center', color: SECONDARY, fontSize: 13 }}>
            未找到匹配的技能
          </Typography>
        )}
      </List>
    </Paper>
  );
}
