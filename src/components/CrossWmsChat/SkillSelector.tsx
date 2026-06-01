import React, { useState, useRef, useEffect } from 'react';
import { Paper, List, ListItem, ListItemText, ListItemIcon, Typography, Box, Divider } from '@mui/material';
import { Skill } from '../../types/skill';
import { ICON_MAP } from '../../types/skill';
import { getAllSkills } from '../../stores/skillStore';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';

interface SkillSelectorProps {
  anchorEl: HTMLElement | null;
  onSelect: (skill: Skill) => void;
  onClose: () => void;
  /** 初始过滤词（如斜杠命令后的文本） */
  initialFilter?: string;
  /** 是否只显示 active 状态的技能 */
  activeOnly?: boolean;
}

export function SkillSelector({ anchorEl, onSelect, onClose, initialFilter = '', activeOnly = false }: SkillSelectorProps) {
  const [filterText, setFilterText] = useState(initialFilter);
  const listRef = useRef<HTMLDivElement>(null);

  // 当 initialFilter 变化时同步
  useEffect(() => {
    setFilterText(initialFilter);
  }, [initialFilter]);

  // 从 skillStore 获取所有技能
  const allSkills = getAllSkills();
  const skills = activeOnly ? allSkills.filter((s) => s.status === 'active') : allSkills;

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

  const filteredSkills = skills.filter(skill =>
    skill.name.toLowerCase().includes(filterText.toLowerCase()) ||
    skill.desc.toLowerCase().includes(filterText.toLowerCase()) ||
    skill.category.toLowerCase().includes(filterText.toLowerCase()) ||
    (skill.trigger || '').toLowerCase().includes(filterText.toLowerCase()) ||
    (skill.tags || []).some(t => t.toLowerCase().includes(filterText.toLowerCase()))
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
      {/* 搜索输入 */}
      <Box sx={{ p: 1, borderBottom: '1px solid #F3F4F6' }}>
        <input
          type="text"
          placeholder="搜索技能..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          autoFocus
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            fontSize: 13,
            padding: '4px 8px',
            backgroundColor: '#F9FAFB',
            borderRadius: 6,
            color: '#111827',
          }}
        />
      </Box>

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
                {ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 20, color: '#6B7280' }} />}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Typography sx={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>
                    {skill.name}
                  </Typography>
                }
                secondary={
                  <Typography sx={{ fontSize: 11, color: '#9CA3AF', mt: 0.25 }}>
                    {skill.trigger ? `${skill.trigger} · ` : ''}{skill.desc}
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
