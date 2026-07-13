import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Paper, List, ListItem, ListItemText, ListItemIcon, Typography, Box, useTheme } from '@mui/material';
import { Skill } from '../../types/skill';
import { ICON_MAP } from '../../types/skill';
import { getAllSkills } from '../../stores/skillStore';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { getGrayScale } from '../../constants/theme';
import {
  fuzzySkillScore,
  getFavoriteSkills,
  getRecentSkills,
  isFavoriteSkill,
  recordRecentSkill,
  toggleFavoriteSkill,
} from '../../utils/skillFavorites';

interface SkillSelectorProps {
  anchorEl: HTMLElement | null;
  onSelect: (skill: Skill) => void;
  onClose: () => void;
  /** 初始过滤词（如斜杠命令后的文本） */
  initialFilter?: string;
  /** 是否只显示 active 状态的技能 */
  activeOnly?: boolean;
  /** 是否由斜杠命令触发（隐藏内部搜索框，用外部输入过滤） */
  slashMode?: boolean;
  /** 外部传入的键盘事件索引（用于键盘导航同步） */
  focusedIndex?: number;
}

export function SkillSelector({ anchorEl, onSelect, onClose, initialFilter = '', activeOnly = false, slashMode = false, focusedIndex }: SkillSelectorProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const listRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  // 当 initialFilter 变化时重置 hover
  useEffect(() => {
    setHoveredIndex(-1);
  }, [initialFilter]);

  // 同步外部传入的 focusedIndex
  useEffect(() => {
    if (focusedIndex !== undefined && focusedIndex >= 0) {
      setHoveredIndex(focusedIndex);
    }
  }, [focusedIndex]);

  // 从 skillStore 获取所有技能
  const allSkills = getAllSkills();
  const skills = activeOnly ? allSkills.filter((s) => s.status === 'active') : allSkills;

  // 斜杠模式用外部传入的 filter，非斜杠模式有内部搜索框
  const filterText = slashMode ? initialFilter : initialFilter;

  // 收藏和最近使用基于 storage 中的 id
  const favoriteIds = useState(() => getFavoriteSkills())[0];
  const recentIds = useState(() => getRecentSkills())[0];

  // 使用模糊匹配（无 query 时按收藏+最近优先排序）
  const filteredSkills = useMemo(() => {
    if (!filterText) {
      const seen = new Set<string>();
      const ordered: Skill[] = [];
      const pushUnique = (s: Skill) => {
        if (seen.has(s.id)) return;
        seen.add(s.id);
        ordered.push(s);
      };
      // 1) favorites
      for (const id of favoriteIds) {
        const s = skills.find((x) => x.id === id);
        if (s) pushUnique(s);
      }
      // 2) recents
      for (const id of recentIds) {
        const s = skills.find((x) => x.id === id);
        if (s) pushUnique(s);
      }
      // 3) rest
      for (const s of skills) pushUnique(s);
      return ordered;
    }
    return skills
      .map((s) => ({
        skill: s,
        score: fuzzySkillScore(filterText, {
          name: s.name,
          id: s.id,
          trigger: s.trigger,
          tags: s.tags,
          desc: s.desc,
        }),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.skill);
  }, [skills, filterText, favoriteIds, recentIds]);

  // 滚动到高亮项
  useEffect(() => {
    if (hoveredIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-skill-index]');
      const target = items[hoveredIndex] as HTMLElement;
      if (target) target.scrollIntoView({ block: 'nearest' });
    }
  }, [hoveredIndex]);

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

  if (!anchorEl) return null;

  const anchorRect = anchorEl.getBoundingClientRect();
  // 从锚点上方弹出，水平居中（限制不超出视口）
  const popupWidth = slashMode ? 400 : 320;
  const popupLeft = Math.max(8, Math.min(
    anchorRect.left + (anchorRect.width - popupWidth) / 2,
    window.innerWidth - popupWidth - 8
  ));

  return (
    <Paper
      ref={listRef}
      elevation={4}
      sx={{
        position: 'fixed',
        bottom: `calc(100vh - ${anchorRect.top}px + 8)`,
        left: popupLeft,
        width: popupWidth,
        maxHeight: 360,
        overflow: 'auto',
        zIndex: 1400,
        borderRadius: '10px',
        border: `1px solid ${gs.border}`,
        bgcolor: gs.bgPanel,
        boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.12)',
      }}
    >
      {/* 斜杠模式标题栏 */}
      {slashMode && (
        <Box sx={{ px: 2, py: 1, borderBottom: `1px solid ${gs.bgHover}`, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: gs.textMuted }}>技能指令</Typography>
          <Typography sx={{ fontSize: 11, color: gs.borderDarker }}>↑↓ 导航 · Enter 选择 · Esc 关闭</Typography>
        </Box>
      )}

      {filteredSkills.length === 0 ? (
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 13, color: gs.textDisabled }}>未找到匹配的技能</Typography>
          {slashMode && filterText && (
            <Typography sx={{ fontSize: 11, color: gs.borderDarker, mt: 0.5 }}>
              尝试其他关键词
            </Typography>
          )}
        </Box>
      ) : (
        <List sx={{ py: 0.5, px: 0 }} role="listbox" aria-label="技能选择列表">
          {filteredSkills.map((skill: Skill, index: number) => (
            <ListItem
              key={skill.id}
              data-skill-index={index}
              role="option"
              aria-selected={hoveredIndex === index}
              tabIndex={hoveredIndex === index ? 0 : -1}
              onClick={() => {
                recordRecentSkill(skill.id);
                onSelect(skill);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  recordRecentSkill(skill.id);
                  onSelect(skill);
                }
              }}
              onMouseEnter={() => setHoveredIndex(index)}
              secondaryAction={
                <StarIcon
                  fontSize="small"
                  sx={{
                    fontSize: 16,
                    color: isFavoriteSkill(skill.id) ? '#f5b400' : gs.textDisabled,
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavoriteSkill(skill.id);
                    // Force re-render to update star color
                    setHoveredIndex((cur) => cur);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleFavoriteSkill(skill.id);
                    }
                  }}
                  tabIndex={0}
                  aria-label={isFavoriteSkill(skill.id) ? '取消收藏' : '添加收藏'}
                />
              }
              sx={{
                py: 1,
                px: 1.5,
                cursor: 'pointer',
                bgcolor: hoveredIndex === index ? gs.bgHover : 'transparent',
                borderRadius: 1,
                mx: 0.5,
                transition: 'background-color 0.1s',
                '&:focus-visible': {
                  outline: `2px solid ${gs.textPrimary}`,
                  outlineOffset: '-2px',
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                {ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 20, color: gs.textMuted }} />}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Typography sx={{ fontSize: 13, fontWeight: 500, color: gs.textPrimary }}>
                    {skill.name}
                    {skill.trigger && (
                      <Typography component="span" sx={{ fontSize: 11, color: gs.textDisabled, ml: 1, fontFamily: 'monospace' }}>
                        {skill.trigger}
                      </Typography>
                    )}
                  </Typography>
                }
                secondary={
                  <Typography sx={{ fontSize: 11, color: gs.textDisabled, mt: 0.25 }} noWrap>
                    {skill.desc}
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
