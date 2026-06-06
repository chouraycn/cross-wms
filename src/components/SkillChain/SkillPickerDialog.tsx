import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import type { Skill } from '../../types/skill';

interface SkillPickerDialogProps {
  open: boolean;
  skills: Skill[];
  onSelect: (skill: Skill) => void;
  onClose: () => void;
}

const SkillPickerDialog: React.FC<SkillPickerDialogProps> = ({ open, skills, onSelect, onClose }) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return skills;
    const q = search.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        s.desc.toLowerCase().includes(q),
    );
  }, [skills, search]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        选择技能
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          size="small"
          placeholder="搜索技能..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ mb: 1 }}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 18 }} />,
          }}
        />
        <List dense>
          {filtered.map((skill) => (
            <ListItemButton
              key={skill.id}
              onClick={() => {
                onSelect(skill);
                onClose();
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, fontSize: 20 }}>
                {skill.icon || '📦'}
              </ListItemIcon>
              <ListItemText
                primary={skill.name}
                secondary={skill.desc.slice(0, 40)}
              />
            </ListItemButton>
          ))}
          {filtered.length === 0 && (
            <ListItemButton disabled>
              <ListItemText
                primary={<Typography sx={{ color: 'text.disabled' }}>无匹配技能</Typography>}
              />
            </ListItemButton>
          )}
        </List>
      </DialogContent>
    </Dialog>
  );
};

export default SkillPickerDialog;
