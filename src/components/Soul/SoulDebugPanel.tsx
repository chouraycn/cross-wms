/**
 * SoulDebugPanel — 规则调试面板
 *
 * 功能：
 * 1. 显示当前加载的所有规则文件（系统/项目/用户/会话）
 * 2. 显示每个规则文件的分段内容（identity/capabilities/constraints/style/knowledge）
 * 3. 显示最终合并后的 system prompt
 * 4. 显示各分段的优先级和来源
 * 5. 显示 token 估算
 * 6. 支持分段展开/折叠
 * 7. 支持搜索规则内容
 * 8. 支持对比两个规则版本
 *
 * 使用 MUI 组件 + getGrayScale 主题
 */

import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Divider,
  LinearProgress,
  Tooltip,
  Badge,
  useTheme,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Compare as CompareIcon,
  Close as CloseIcon,
  Person as PersonIcon,
  Settings as SettingsIcon,
  Description as DescriptionIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Wifi as WifiIcon,
  WifiOff as WifiOffIcon,
} from '@mui/icons-material';
import { getGrayScale } from '../../constants/theme';
import { useSoulHotReload, type SoulProfile } from '../../hooks/useSoulHotReload';

// ===================== Types =====================

interface SoulSection {
  name: string;
  label: string;
  content: string;
  priority: number;
  source: 'soul' | 'user';
}

interface TokenEstimate {
  total: number;
  sections: Record<string, number>;
}

// ===================== Helper Functions =====================

/**
 * 估算 token 数量（简单估算：4 字符 ≈ 1 token）
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  // 中文字符约 1.5 tokens，英文约 0.25 tokens
  // 简化估算：平均 4 字符 = 1 token
  return Math.ceil(text.length / 4);
}

/**
 * 解析 SOUL.md 分段
 */
function parseSoulSections(profile: SoulProfile): SoulSection[] {
  const sections: SoulSection[] = [];

  // Identity
  sections.push({
    name: 'identity',
    label: '身份',
    content: profile.identity,
    priority: 1,
    source: 'soul',
  });

  // Personality
  sections.push({
    name: 'personality',
    label: '人格模式',
    content: profile.personality,
    priority: 2,
    source: 'soul',
  });

  // Tone
  if (profile.tone.length > 0) {
    sections.push({
      name: 'tone',
      label: '语气',
      content: profile.tone.join('\n'),
      priority: 3,
      source: 'soul',
    });
  }

  // Values
  if (profile.values.length > 0) {
    sections.push({
      name: 'values',
      label: '价值观',
      content: profile.values.join('\n'),
      priority: 4,
      source: 'soul',
    });
  }

  // Forbidden Zones
  if (profile.forbiddenZones.length > 0) {
    sections.push({
      name: 'forbiddenZones',
      label: '禁区',
      content: profile.forbiddenZones.join('\n'),
      priority: 5,
      source: 'soul',
    });
  }

  // Strategy
  sections.push({
    name: 'strategy',
    label: '策略偏好',
    content: JSON.stringify(profile.strategy, null, 2),
    priority: 6,
    source: 'soul',
  });

  // User Profile
  if (profile.rawUserContent) {
    sections.push({
      name: 'userProfile',
      label: '用户画像',
      content: profile.rawUserContent.slice(0, 500),
      priority: 7,
      source: 'user',
    });
  }

  return sections;
}

/**
 * 构建最终 system prompt
 */
function buildFinalPrompt(profile: SoulProfile): string {
  const parts: string[] = [];

  parts.push(`[人格身份] ${profile.identity}`);
  parts.push(`[人格模式] ${profile.personality}`);

  if (profile.tone.length > 0) {
    parts.push(`[语气] ${profile.tone.join('；')}`);
  }

  if (profile.values.length > 0) {
    parts.push(`[价值观] ${profile.values.join('；')}`);
  }

  if (profile.forbiddenZones.length > 0) {
    parts.push(`[禁区] ${profile.forbiddenZones.join('；')}`);
  }

  if (profile.rawUserContent) {
    const userSummary = profile.rawUserContent
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^#+\s+/gm, '')
      .trim()
      .slice(0, 500);
    parts.push(`[用户画像]\n${userSummary}`);
  }

  return parts.join('\n');
}

// ===================== Components =====================

interface SectionCardProps {
  section: SoulSection;
  searchQuery: string;
  isExpanded: boolean;
  onToggle: () => void;
}

const SectionCard = memo<SectionCardProps>((props) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const { section, searchQuery, isExpanded, onToggle } = props;

  // 搜索匹配高亮
  const highlightedContent = useMemo(() => {
    if (!searchQuery) return section.content;

    const regex = new RegExp(searchQuery, 'gi');
    return section.content.replace(regex, (match) => `**${match}**`);
  }, [section.content, searchQuery]);

  return (
    <Accordion
      expanded={isExpanded}
      onChange={onToggle}
      sx={{
        mb: 1,
        backgroundColor: gs.bgPanel,
        border: `1px solid ${gs.border}`,
        borderRadius: 1.5,
        '&:before': { display: 'none' },
        '&.Mui-expanded': { margin: 0 },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ color: gs.textSecondary }} />}
        sx={{
          px: 2,
          py: 1,
          '&.Mui-expanded': { minHeight: 48 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <Chip
            label={section.label}
            size="small"
            sx={{
              backgroundColor: section.source === 'soul' ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.15)',
              color: section.source === 'soul' ? '#6366f1' : '#10b981',
              fontWeight: 600,
              fontSize: '0.75rem',
            }}
          />
          <Typography sx={{ fontSize: '0.8rem', color: gs.textPrimary }}>
            {section.name}
          </Typography>
          <Chip
            label={`P${section.priority}`}
            size="small"
            sx={{
              backgroundColor: gs.bgHover,
              color: gs.textMuted,
              fontSize: '0.7rem',
              ml: 'auto',
            }}
          />
          <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
            {estimateTokens(section.content)} tokens
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2, py: 1.5 }}>
        <Paper
          sx={{
            p: 1.5,
            backgroundColor: gs.bgInput,
            border: `1px solid ${gs.borderLighter}`,
            borderRadius: 1,
          }}
        >
          <Typography
            sx={{
              fontSize: '0.8rem',
              color: gs.textPrimary,
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
              lineHeight: 1.6,
            }}
          >
            {highlightedContent}
          </Typography>
        </Paper>
      </AccordionDetails>
    </Accordion>
  );
});

SectionCard.displayName = 'SectionCard';

// ===================== Main Component =====================

interface SoulDebugPanelProps {
  onEdit?: (fileType: 'soul' | 'user') => void;
}

const SoulDebugPanel: React.FC<SoulDebugPanelProps> = ({ onEdit }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const {
    isConnected,
    profile,
    lastUpdated,
    hasUpdate,
    error,
    eventCount,
    reconnect,
    clearUpdate,
    refresh,
  } = useSoulHotReload();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['identity', 'personality']));
  const [activeTab, setActiveTab] = useState<'sections' | 'prompt' | 'raw'>('sections');
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [previousProfile, setPreviousProfile] = useState<SoulProfile | null>(null);

  // 解析分段
  const sections = useMemo(() => {
    if (!profile) return [];
    return parseSoulSections(profile);
  }, [profile]);

  // 最终 system prompt
  const finalPrompt = useMemo(() => {
    if (!profile) return '';
    return buildFinalPrompt(profile);
  }, [profile]);

  // Token 估算
  const tokenEstimate = useMemo<TokenEstimate>(() => {
    const result: TokenEstimate = {
      total: estimateTokens(finalPrompt),
      sections: {},
    };

    for (const section of sections) {
      result.sections[section.name] = estimateTokens(section.content);
    }

    return result;
  }, [finalPrompt, sections]);

  // 处理更新提示
  useEffect(() => {
    if (hasUpdate && profile) {
      // 保存旧版本用于对比
      setPreviousProfile(profile);
      clearUpdate();
    }
  }, [hasUpdate, profile, clearUpdate]);

  // 切换分段展开/折叠
  const toggleSection = useCallback((sectionName: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionName)) {
        newSet.delete(sectionName);
      } else {
        newSet.add(sectionName);
      }
      return newSet;
    });
  }, []);

  // 全部展开
  const expandAll = useCallback(() => {
    setExpandedSections(new Set(sections.map(s => s.name)));
  }, [sections]);

  // 全部折叠
  const collapseAll = useCallback(() => {
    setExpandedSections(new Set());
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: gs.textPrimary }}>
          规则调试面板
        </Typography>

        {/* Connection Status */}
        <Tooltip title={isConnected ? 'SSE 已连接' : 'SSE 未连接'}>
          <Badge
            badgeContent={eventCount}
            color="primary"
            max={99}
            sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', height: 18, minWidth: 18 } }}
          >
            {isConnected ? (
              <WifiIcon sx={{ fontSize: 20, color: '#10b981' }} />
            ) : (
              <WifiOffIcon sx={{ fontSize: 20, color: gs.textMuted }} />
            )}
          </Badge>
        </Tooltip>

        {/* Update Badge */}
        {hasUpdate && (
          <Chip
            label="已更新"
            size="small"
            color="success"
            icon={<CheckCircleIcon />}
            sx={{ fontSize: '0.7rem' }}
          />
        )}

        {/* Error Alert */}
        {error && (
          <Chip
            label={error}
            size="small"
            color="error"
            icon={<ErrorIcon />}
            sx={{ fontSize: '0.7rem' }}
          />
        )}
      </Box>

      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        {/* Search */}
        <TextField
          size="small"
          placeholder="搜索规则内容..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ minWidth: 200, flex: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: gs.textMuted }} />
              </InputAdornment>
            ),
          }}
        />

        {/* Refresh */}
        <Tooltip title="手动刷新">
          <IconButton size="small" onClick={() => refresh()}>
            <RefreshIcon sx={{ fontSize: 18, color: gs.textSecondary }} />
          </IconButton>
        </Tooltip>

        {/* Reconnect */}
        {!isConnected && (
          <Tooltip title="重新连接 SSE">
            <IconButton size="small" onClick={() => reconnect()}>
              <WifiIcon sx={{ fontSize: 18, color: gs.textMuted }} />
            </IconButton>
          </Tooltip>
        )}

        {/* Expand/Collapse */}
        <Button size="small" onClick={expandAll} sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
          全部展开
        </Button>
        <Button size="small" onClick={collapseAll} sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
          全部折叠
        </Button>

        {/* Compare */}
        <Tooltip title="对比版本">
          <IconButton size="small" onClick={() => setCompareDialogOpen(true)}>
            <CompareIcon sx={{ fontSize: 18, color: gs.textSecondary }} />
          </IconButton>
        </Tooltip>

        {/* Edit */}
        {onEdit && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditIcon sx={{ fontSize: 16 }} />}
            onClick={() => onEdit('soul')}
            sx={{ fontSize: '0.75rem', ml: 'auto' }}
          >
            编辑规则
          </Button>
        )}
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(e, v) => setActiveTab(v)}
        sx={{
          minHeight: 36,
          '& .MuiTab-root': {
            minHeight: 36,
            py: 0.5,
            fontSize: '0.8rem',
            fontWeight: 600,
          },
        }}
      >
        <Tab value="sections" label="分段详情" />
        <Tab value="prompt" label="最终 Prompt" />
        <Tab value="raw" label="原始文件" />
      </Tabs>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {profile ? (
          <>
            {/* Sections Tab */}
            {activeTab === 'sections' && (
              <Box>
                {/* Token Summary */}
                <Paper
                  sx={{
                    p: 2,
                    mb: 2,
                    backgroundColor: gs.bgPanel,
                    border: `1px solid ${gs.border}`,
                    borderRadius: 1.5,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
                      Token 估算
                    </Typography>
                    <Chip
                      label={`${tokenEstimate.total} tokens`}
                      size="small"
                      sx={{
                        backgroundColor: tokenEstimate.total > 2000 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                        color: tokenEstimate.total > 2000 ? '#ef4444' : '#10b981',
                        fontWeight: 600,
                      }}
                    />
                    {tokenEstimate.total > 2000 && (
                      <Typography sx={{ fontSize: '0.7rem', color: '#ef4444' }}>
                        ⚠️ 建议控制在 2000 tokens 以内
                      </Typography>
                    )}
                    <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, ml: 'auto' }}>
                      最后更新: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '-'}
                    </Typography>
                  </Box>
                </Paper>

                {/* Sections List */}
                {sections.map(section => (
                  <SectionCard
                    key={section.name}
                    section={section}
                    searchQuery={searchQuery}
                    isExpanded={expandedSections.has(section.name)}
                    onToggle={() => toggleSection(section.name)}
                  />
                ))}
              </Box>
            )}

            {/* Prompt Tab */}
            {activeTab === 'prompt' && (
              <Paper
                sx={{
                  p: 2,
                  backgroundColor: gs.bgPanel,
                  border: `1px solid ${gs.border}`,
                  borderRadius: 1.5,
                }}
              >
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary, mb: 1.5 }}>
                  最终 System Prompt
                </Typography>
                <Paper
                  sx={{
                    p: 2,
                    backgroundColor: gs.bgInput,
                    border: `1px solid ${gs.borderLighter}`,
                    borderRadius: 1,
                    maxHeight: 400,
                    overflow: 'auto',
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: '0.8rem',
                      color: gs.textPrimary,
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'monospace',
                      lineHeight: 1.6,
                    }}
                  >
                    {finalPrompt}
                  </Typography>
                </Paper>
                <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
                    总长度: {finalPrompt.length} 字符
                  </Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
                    Tokens: {tokenEstimate.total}
                  </Typography>
                </Box>
              </Paper>
            )}

            {/* Raw Tab */}
            {activeTab === 'raw' && (
              <Box sx={{ display: 'flex', gap: 2 }}>
                {/* SOUL.md */}
                <Paper
                  sx={{
                    flex: 1,
                    p: 2,
                    backgroundColor: gs.bgPanel,
                    border: `1px solid ${gs.border}`,
                    borderRadius: 1.5,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <DescriptionIcon sx={{ fontSize: 18, color: '#6366f1' }} />
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
                      SOUL.md
                    </Typography>
                    {onEdit && (
                      <IconButton size="small" onClick={() => onEdit('soul')}>
                        <EditIcon sx={{ fontSize: 16, color: gs.textSecondary }} />
                      </IconButton>
                    )}
                  </Box>
                  <Paper
                    sx={{
                      p: 1.5,
                      backgroundColor: gs.bgInput,
                      border: `1px solid ${gs.borderLighter}`,
                      borderRadius: 1,
                      maxHeight: 300,
                      overflow: 'auto',
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: '0.75rem',
                        color: gs.textPrimary,
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        lineHeight: 1.5,
                      }}
                    >
                      {profile.rawSoulContent || '(无内容)'}
                    </Typography>
                  </Paper>
                </Paper>

                {/* USER.md */}
                <Paper
                  sx={{
                    flex: 1,
                    p: 2,
                    backgroundColor: gs.bgPanel,
                    border: `1px solid ${gs.border}`,
                    borderRadius: 1.5,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <PersonIcon sx={{ fontSize: 18, color: '#10b981' }} />
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
                      USER.md
                    </Typography>
                    {onEdit && (
                      <IconButton size="small" onClick={() => onEdit('user')}>
                        <EditIcon sx={{ fontSize: 16, color: gs.textSecondary }} />
                      </IconButton>
                    )}
                  </Box>
                  <Paper
                    sx={{
                      p: 1.5,
                      backgroundColor: gs.bgInput,
                      border: `1px solid ${gs.borderLighter}`,
                      borderRadius: 1,
                      maxHeight: 300,
                      overflow: 'auto',
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: '0.75rem',
                        color: gs.textPrimary,
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        lineHeight: 1.5,
                      }}
                    >
                      {profile.rawUserContent || '(无内容)'}
                    </Typography>
                  </Paper>
                </Paper>
              </Box>
            )}
          </>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4, gap: 1 }}>
            <CircularProgress size={20} />
            <Typography sx={{ fontSize: '0.875rem', color: gs.textMuted }}>
              正在加载规则配置...
            </Typography>
          </Box>
        )}
      </Box>

      {/* Compare Dialog */}
      <Dialog
        open={compareDialogOpen}
        onClose={() => setCompareDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CompareIcon sx={{ fontSize: 20, color: gs.textPrimary }} />
            <Typography sx={{ fontSize: '1rem', fontWeight: 600 }}>
              版本对比
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {previousProfile && profile ? (
            <Box sx={{ display: 'flex', gap: 2 }}>
              {/* Previous Version */}
              <Paper sx={{ flex: 1, p: 2, backgroundColor: gs.bgPanel, border: `1px solid ${gs.border}` }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
                  上一版本
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
                  {previousProfile.identity}
                </Typography>
              </Paper>

              {/* Current Version */}
              <Paper sx={{ flex: 1, p: 2, backgroundColor: gs.bgPanel, border: `1px solid ${gs.border}` }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
                  当前版本
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
                  {profile.identity}
                </Typography>
              </Paper>
            </Box>
          ) : (
            <Typography sx={{ fontSize: '0.8rem', color: gs.textMuted }}>
              无历史版本可对比
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompareDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default memo(SoulDebugPanel);