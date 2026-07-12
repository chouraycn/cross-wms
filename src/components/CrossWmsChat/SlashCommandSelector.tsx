import React, { useEffect, useRef } from 'react';
import { Paper, List, ListItem, ListItemText, Typography, Box, useTheme, Chip } from '@mui/material';
import { getGrayScale } from '../../constants/theme';
import { SlashCommand } from '../../hooks/useSlashCommands';

interface SlashCommandSelectorProps {
  anchorEl: HTMLElement | null;
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  model: '模型',
  session: '会话',
  utility: '工具',
  debug: '调试',
};

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  model: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' },
  session: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22C55E' },
  utility: { bg: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6' },
  debug: { bg: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' },
};

export function SlashCommandSelector({
  anchorEl,
  commands,
  selectedIndex,
  onSelect,
  onClose,
}: SlashCommandSelectorProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-cmd-index]');
      const target = items[selectedIndex] as HTMLElement;
      if (target) target.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        anchorEl &&
        !anchorEl.contains(e.target as Node) &&
        listRef.current &&
        !listRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [anchorEl, onClose]);

  if (!anchorEl || commands.length === 0) return null;

  const anchorRect = anchorEl.getBoundingClientRect();
  const top = anchorRect.top - 8;
  const left = anchorRect.left;
  const maxHeight = Math.min(320, anchorRect.top - 20);

  return (
    <Paper
      ref={listRef}
      elevation={0}
      sx={{
        position: 'fixed',
        top: top,
        left: left,
        width: Math.min(anchorRect.width, 320),
        maxHeight: maxHeight,
        overflowY: 'auto',
        overflowX: 'hidden',
        transform: 'translateY(-100%)',
        borderRadius: '12px',
        border: `1px solid ${gs.border}`,
        bgcolor: gs.bgPanel,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
        zIndex: 9999,
        '&::-webkit-scrollbar': {
          width: '6px',
        },
        '&::-webkit-scrollbar-thumb': {
          bgcolor: gs.border,
          borderRadius: '3px',
        },
      }}
    >
      <Box sx={{ px: 1.5, py: 1, borderBottom: `1px solid ${gs.border}` }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: gs.textMuted }}>
          斜杠命令
        </Typography>
      </Box>
      <List sx={{ py: 0.5 }}>
        {commands.map((cmd, index) => {
          const isSelected = index === selectedIndex;
          const colors = CATEGORY_COLORS[cmd.category] || CATEGORY_COLORS.utility;
          return (
            <ListItem
              key={cmd.name}
              data-cmd-index={index}
              button
              onClick={() => onSelect(cmd)}
              sx={{
                py: 1,
                px: 1.5,
                bgcolor: isSelected ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent',
                '&:hover': {
                  bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                },
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: gs.textPrimary,
                      fontFamily: 'monospace',
                    }}
                  >
                    /{cmd.name}
                  </Typography>
                  <Chip
                    label={CATEGORY_LABELS[cmd.category] || cmd.category}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: 10,
                      fontWeight: 500,
                      bgcolor: colors.bg,
                      color: colors.color,
                      '& .MuiChip-label': { px: 0.75 },
                    }}
                  />
                </Box>
                <Typography
                  sx={{
                    fontSize: 11.5,
                    color: gs.textMuted,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cmd.description}
                </Typography>
              </Box>
            </ListItem>
          );
        })}
      </List>
    </Paper>
  );
}

export default SlashCommandSelector;
