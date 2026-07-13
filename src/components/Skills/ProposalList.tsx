import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, Paper, Stack, Chip, TextField, Select,
  MenuItem, FormControl, InputLabel, IconButton, CircularProgress,
} from '@mui/material';
import { Refresh, FilterAlt, Search } from '@mui/icons-material';
import type { SkillProposal, ProposalFilter, ProposalStatus, ProposalType } from '../../types/proposal';
import type { GrayScale } from '../../constants/theme';
import { getProposals } from '../../services/proposalApi';

interface ProposalListProps {
  gs: GrayScale;
  isDark: boolean;
  onSelectProposal: (proposal: SkillProposal) => void;
}

const statusLabels: Record<ProposalStatus, { label: string; color: string; bg: string }> = {
  pending: { label: '待审批', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  applied: { label: '已应用', color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
  rejected: { label: '已拒绝', color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  quarantined: { label: '已隔离', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  stale: { label: '已过期', color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
};

const typeLabels: Record<ProposalType, { label: string; color: string }> = {
  create: { label: '创建', color: '#8B5CF6' },
  update: { label: '更新', color: '#06B6D4' },
};

export const ProposalList: React.FC<ProposalListProps> = ({ gs, isDark, onSelectProposal }) => {
  const [proposals, setProposals] = useState<SkillProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<ProposalFilter>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const fetchProposals = async () => {
    setLoading(true);
    try {
      const result = await getProposals(filter);
      setProposals(result.proposals);
    } catch (e) {
      console.error('Failed to fetch proposals:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, [filter]);

  const handleStatusChange = (status: ProposalStatus | undefined) => {
    setFilter(prev => ({ ...prev, status }));
  };

  const handleTypeChange = (type: ProposalType | undefined) => {
    setFilter(prev => ({ ...prev, type }));
  };

  const handleSearch = () => {
    setFilter(prev => ({ ...prev, skillName: searchTerm || undefined }));
  };

  const filteredProposals = proposals.filter(p => {
    if (!searchTerm) return true;
    return p.skillName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // 键盘导航处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredProposals.length === 0) return;
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex(prev => {
            const next = prev < filteredProposals.length - 1 ? prev + 1 : 0;
            return next;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex(prev => {
            const next = prev > 0 ? prev - 1 : filteredProposals.length - 1;
            return next;
          });
          break;
        case 'Enter':
          if (focusedIndex >= 0) {
            e.preventDefault();
            onSelectProposal(filteredProposals[focusedIndex]);
          }
          break;
        case 'Escape':
          setFocusedIndex(-1);
          break;
      }
    };
    
    const container = listRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown);
      return () => container.removeEventListener('keydown', handleKeyDown);
    }
  }, [filteredProposals, focusedIndex, onSelectProposal]);

  // 滚动到焦点项
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-proposal-index]');
      const target = items[focusedIndex] as HTMLElement;
      if (target) target.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>状态</InputLabel>
            <Select
              value={filter.status || ''}
              label="状态"
              onChange={(e) => handleStatusChange(e.target.value as ProposalStatus || undefined)}
            >
              <MenuItem value="">全部</MenuItem>
              {Object.entries(statusLabels).map(([key, value]) => (
                <MenuItem key={key} value={key}>{value.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>类型</InputLabel>
            <Select
              value={filter.type || ''}
              label="类型"
              onChange={(e) => handleTypeChange(e.target.value as ProposalType || undefined)}
            >
              <MenuItem value="">全部</MenuItem>
              {Object.entries(typeLabels).map(([key, value]) => (
                <MenuItem key={key} value={key}>{value.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 1, flex: 1, minWidth: 200 }}>
            <TextField
              size="small"
              placeholder="搜索技能名称..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              sx={{ flex: 1 }}
              InputProps={{
                startAdornment: <Search sx={{ fontSize: 16, mr: 1 }} />,
              }}
            />
            <Button size="small" onClick={handleSearch}>搜索</Button>
          </Box>

          <IconButton size="small" onClick={fetchProposals} disabled={loading}>
            <Refresh sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      </Box>

      <Box ref={listRef} sx={{ flex: 1, overflowY: 'auto', px: 0.5 }} tabIndex={0} role="listbox" aria-label="技能提案列表">
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={24} />
          </Box>
        ) : filteredProposals.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <Typography variant="body2" sx={{ color: gs.textMuted }}>暂无提案</Typography>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {filteredProposals.map((proposal, index) => {
              const statusConfig = statusLabels[proposal.status];
              const typeConfig = typeLabels[proposal.type];
              const hasCritical = proposal.scan.critical > 0;

              return (
                <Paper
                  key={proposal.id}
                  data-proposal-index={index}
                  role="option"
                  aria-selected={focusedIndex === index}
                  tabIndex={focusedIndex === index ? 0 : -1}
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 1.5,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    border: `1px solid ${focusedIndex === index ? '#3B82F6' : gs.border}`,
                    bgcolor: focusedIndex === index 
                      ? (isDark ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.05)')
                      : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                    '&:hover': {
                      bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                      borderColor: '#3B82F6',
                    },
                    '&:focus-visible': {
                      outline: `2px solid #3B82F6`,
                      outlineOffset: '-2px',
                    },
                  }}
                  onClick={() => onSelectProposal(proposal)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onSelectProposal(proposal);
                    }
                  }}
                  onMouseEnter={() => setFocusedIndex(index)}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <Chip
                      label={typeConfig.label}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: 10,
                        color: typeConfig.color,
                        bgcolor: `${typeConfig.color}20`,
                        border: `1px solid ${typeConfig.color}30`,
                      }}
                    />
                    <Chip
                      label={statusConfig.label}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: 10,
                        color: statusConfig.color,
                        bgcolor: statusConfig.bg,
                        border: `1px solid ${statusConfig.color}30`,
                      }}
                    />
                    {hasCritical && (
                      <Chip
                        label="🔴 高风险"
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: 10,
                          color: '#EF4444',
                          bgcolor: 'rgba(239,68,68,0.1)',
                        }}
                      />
                    )}
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="body1" sx={{ fontWeight: 500, color: gs.textPrimary }}>
                      {proposal.skillName}
                    </Typography>
                    <Typography variant="caption" sx={{ color: gs.textMuted }}>
                      {new Date(proposal.createdAt).toLocaleString()}
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Chip
                      label={`C:${proposal.scan.critical}`}
                      size="small"
                      sx={{ fontSize: 10, color: proposal.scan.critical > 0 ? '#EF4444' : gs.textMuted }}
                    />
                    <Chip
                      label={`W:${proposal.scan.warn}`}
                      size="small"
                      sx={{ fontSize: 10, color: proposal.scan.warn > 0 ? '#F59E0B' : gs.textMuted }}
                    />
                    <Chip
                      label={`I:${proposal.scan.info}`}
                      size="small"
                      sx={{ fontSize: 10, color: proposal.scan.info > 0 ? '#3B82F6' : gs.textMuted }}
                    />
                  </Box>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default ProposalList;