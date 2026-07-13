import React, { useMemo, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  Alert,
  AlertTitle,
  TextField,
  InputAdornment,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Stack,
  Divider,
  Collapse,
  Paper,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import type { ProposalScan, ProposalScanFinding } from '../../types/proposal';
import type { GrayScale } from '../../constants/theme';

interface ScanResultsProps {
  scan: ProposalScan;
  gs: GrayScale;
  isDark: boolean;
}

type SeverityFilter = 'all' | 'critical' | 'warn' | 'info';

const SEVERITY_META: Record<
  string,
  { bg: string; color: string; icon: string; label: string }
> = {
  critical: { bg: 'rgba(239,68,68,0.15)', color: '#EF4444', icon: '🛑', label: '严重' },
  high: { bg: 'rgba(239,68,68,0.1)', color: '#EF4444', icon: '⚠️', label: '高' },
  medium: { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B', icon: '⚡', label: '中' },
  low: { bg: 'rgba(59,130,246,0.1)', color: '#3B82F6', icon: 'ℹ️', label: '低' },
  info: { bg: 'rgba(59,130,246,0.1)', color: '#3B82F6', icon: 'ℹ️', label: '提示' },
  none: { bg: 'rgba(34,197,94,0.1)', color: '#22C55E', icon: '✅', label: '无' },
};

function getSeverityKey(finding: ProposalScanFinding): keyof typeof SEVERITY_META {
  const lvl = (finding.level || '').toLowerCase();
  if (lvl === 'critical' || lvl === 'high') return lvl as 'critical' | 'high';
  if (lvl === 'medium' || lvl === 'warn' || lvl === 'warning') return 'medium';
  if (lvl === 'low' || lvl === 'info') return 'low';
  return 'info';
}

function normalizeLevel(finding: ProposalScanFinding): SeverityFilter {
  const lvl = (finding.level || '').toLowerCase();
  if (lvl === 'critical' || lvl === 'high') return 'critical';
  if (lvl === 'medium' || lvl === 'warn' || lvl === 'warning') return 'warn';
  return 'info';
}

interface GroupedFindings {
  ruleId: string;
  severity: SeverityFilter;
  count: number;
  items: ProposalScanFinding[];
}

function groupFindingsByRule(findings: ProposalScanFinding[]): GroupedFindings[] {
  const groups = new Map<string, GroupedFindings>();
  for (const finding of findings) {
    const ruleId = finding.type || 'unknown';
    const severity = normalizeLevel(finding);
    const key = `${ruleId}::${severity}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.items.push(finding);
    } else {
      groups.set(key, { ruleId, severity, count: 1, items: [finding] });
    }
  }
  return Array.from(groups.values()).sort((a, b) => {
    const order: Record<SeverityFilter, number> = { critical: 0, warn: 1, info: 2, all: 3 };
    return order[a.severity] - order[b.severity] || b.count - a.count;
  });
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const ScanResults: React.FC<ScanResultsProps> = ({ scan, gs, isDark }) => {
  const { critical, warn, info, findings } = scan;
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const overallSeverity: 'error' | 'warning' | 'success' =
    critical > 0 ? 'error' : warn > 0 ? 'warning' : 'success';

  const filteredFindings = useMemo(() => {
    let result = findings;
    if (severityFilter !== 'all') {
      result = result.filter((f) => normalizeLevel(f) === severityFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          (f.type || '').toLowerCase().includes(q) ||
          (f.description || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [findings, search, severityFilter]);

  const grouped = useMemo(() => groupFindingsByRule(filteredFindings), [filteredFindings]);

  const handleToggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleCopyAll = useCallback(() => {
    const text = filteredFindings
      .map((f) => `[${(f.level || 'info').toUpperCase()}] ${f.type}: ${f.description}`)
      .join('\n');
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
  }, [filteredFindings]);

  const handleExport = useCallback(() => {
    downloadJson(`scan-results-${Date.now()}.json`, {
      generatedAt: new Date().toISOString(),
      summary: { critical, warn, info },
      findings: filteredFindings,
    });
  }, [critical, warn, info, filteredFindings]);

  return (
    <Box sx={{ mt: 2 }}>
      {/* Summary chips */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip
          label={`严重: ${critical}`}
          size="small"
          sx={{
            bgcolor: critical > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(107,114,128,0.1)',
            color: critical > 0 ? '#EF4444' : gs.textMuted,
            fontWeight: 500,
          }}
        />
        <Chip
          label={`警告: ${warn}`}
          size="small"
          sx={{
            bgcolor: warn > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(107,114,128,0.1)',
            color: warn > 0 ? '#F59E0B' : gs.textMuted,
            fontWeight: 500,
          }}
        />
        <Chip
          label={`提示: ${info}`}
          size="small"
          sx={{
            bgcolor: info > 0 ? 'rgba(59,130,246,0.1)' : 'rgba(107,114,128,0.1)',
            color: info > 0 ? '#3B82F6' : gs.textMuted,
            fontWeight: 500,
          }}
        />
        <Box sx={{ flex: 1 }} />
        {findings.length > 0 && (
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="复制所有发现">
              <IconButton size="small" onClick={handleCopyAll}>
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="导出为 JSON">
              <IconButton size="small" onClick={handleExport}>
                <DownloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Box>

      {/* Search + filter */}
      {findings.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
          <TextField
            size="small"
            placeholder="搜索发现…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ flex: 1 }}
          />
          <ToggleButtonGroup
            size="small"
            value={severityFilter}
            exclusive
            onChange={(_, value) => value && setSeverityFilter(value)}
            aria-label="severity filter"
          >
            <ToggleButton value="all">全部</ToggleButton>
            <ToggleButton value="critical">严重</ToggleButton>
            <ToggleButton value="warn">警告</ToggleButton>
            <ToggleButton value="info">提示</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      )}

      {/* Findings list (grouped by rule) */}
      {grouped.length > 0 && (
        <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
          {grouped.map((group) => {
            const key = `${group.ruleId}::${group.severity}`;
            const isExpanded = expandedGroups.has(key) || (search.trim().length > 0);
            const meta = SEVERITY_META[group.severity] || SEVERITY_META.info;
            return (
              <Paper
                key={key}
                elevation={0}
                sx={{
                  mb: 1,
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                  borderLeft: `3px solid ${meta.color}`,
                  borderRadius: 1,
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    p: 1,
                    cursor: 'pointer',
                    bgcolor: meta.bg,
                  }}
                  onClick={() => handleToggleGroup(key)}
                >
                  <IconButton size="small" sx={{ p: 0.25, mr: 0.5 }}>
                    {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                  </IconButton>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: meta.color, flex: 1 }}>
                    {group.ruleId}
                  </Typography>
                  <Chip
                    label={`${group.count} 处`}
                    size="small"
                    sx={{ height: 20, fontSize: 11, bgcolor: meta.bg, color: meta.color }}
                  />
                </Box>
                <Collapse in={isExpanded}>
                  <Divider />
                  {group.items.map((finding, index) => {
                    const sevKey = getSeverityKey(finding);
                    const itemMeta = SEVERITY_META[sevKey] || SEVERITY_META.info;
                    return (
                      <Box
                        key={`${finding.type}-${index}`}
                        sx={{
                          p: 1.25,
                          pl: 4,
                          borderBottom:
                            index < group.items.length - 1
                              ? `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`
                              : 'none',
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="flex-start">
                          <Box sx={{ fontSize: 14 }}>{itemMeta.icon}</Box>
                          <Box sx={{ flex: 1 }}>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
                              <Typography sx={{ fontSize: 12, fontWeight: 600, color: itemMeta.color }}>
                                {finding.type}
                              </Typography>
                              <Chip
                                label={itemMeta.label}
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: 10,
                                  bgcolor: itemMeta.bg,
                                  color: itemMeta.color,
                                }}
                              />
                            </Stack>
                            <Typography sx={{ fontSize: 11, color: gs.textSecondary, lineHeight: 1.5 }}>
                              {finding.description}
                            </Typography>
                          </Box>
                        </Stack>
                      </Box>
                    );
                  })}
                </Collapse>
              </Paper>
            );
          })}
        </Box>
      )}

      {/* Empty states */}
      {findings.length === 0 && (
        <Alert severity="success" sx={{ fontSize: 12, p: 1.5 }}>
          <AlertTitle sx={{ fontSize: 12, fontWeight: 600 }}>扫描完成</AlertTitle>
          未发现安全风险
        </Alert>
      )}

      {findings.length > 0 && grouped.length === 0 && (
        <Alert severity={overallSeverity} sx={{ fontSize: 12, p: 1.5 }}>
          <AlertTitle sx={{ fontSize: 12, fontWeight: 600 }}>无匹配项</AlertTitle>
          当前过滤条件下没有发现风险项
        </Alert>
      )}

      {/* Footer hint */}
      {findings.length > 0 && (
        <Typography sx={{ fontSize: 10, color: gs.textMuted, mt: 1, textAlign: 'right' }}>
          共 {findings.length} 项发现 · 显示 {grouped.length} 个分组
        </Typography>
      )}
    </Box>
  );
};

export default ScanResults;
