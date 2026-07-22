import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, CircularProgress, Paper, Button, Chip,
  ToggleButton, ToggleButtonGroup, LinearProgress,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import InsightsIcon from '@mui/icons-material/Insights';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useToast } from '../contexts/ToastContext';
import { fetchSkillUsageAnalytics } from '../services/api';
import type { SkillUsageAnalytics } from '../services/api';
import { getGrayScale } from '../constants/theme';
import { usePageFadeIn } from '../hooks/usePageFadeIn';

const SkillUsageAnalyticsPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<7 | 14 | 30 | 90>(7);
  const [data, setData] = useState<SkillUsageAnalytics | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSkillUsageAnalytics({ days, top: 15 });
      setData(res);
    } catch (e) {
      showToast(`加载使用分析失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [days, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const isDark = false;
  const gs = getGrayScale(isDark);
  const fadeCls = usePageFadeIn();

  const trendMax = data ? Math.max(...data.trend.map((t) => t.count), 1) : 1;
  const topMax = data && data.topSkills.length > 0 ? data.topSkills[0].count : 1;

  const formatTime = (iso: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} 小时前`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} 天前`;
    return d.toLocaleDateString('zh-CN');
  };

  if (loading && !data) {
    return (
      <Box className={fadeCls} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 1.5 }}>
        <CircularProgress size={20} sx={{ color: gs.textMuted }} />
        <Typography sx={{ fontSize: '0.875rem', color: gs.textMuted }}>加载使用分析...</Typography>
      </Box>
    );
  }

  return (
    <Box className={fadeCls} sx={{ p: 1 }}>
      {/* 顶部标题栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <InsightsIcon sx={{ fontSize: 20, color: '#7C3AED' }} />
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: gs.textPrimary }}>
              技能使用分析
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted }}>
            追踪技能使用频次、趋势、状态分布与高频共现组合
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <ToggleButtonGroup
            value={days}
            exclusive
            size="small"
            onChange={(_, v) => v && setDays(v as 7 | 14 | 30 | 90)}
            sx={{
              '& .MuiToggleButton-root': {
                px: 1.5, py: 0.5, fontSize: '0.75rem', textTransform: 'none',
                border: `1px solid ${gs.border}`,
              },
              '& .Mui-selected': {
                backgroundColor: '#7C3AED !important',
                color: '#FFFFFF !important',
              },
            }}
          >
            <ToggleButton value={7}>7 天</ToggleButton>
            <ToggleButton value={14}>14 天</ToggleButton>
            <ToggleButton value={30}>30 天</ToggleButton>
            <ToggleButton value={90}>90 天</ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
            onClick={load}
            disabled={loading}
            sx={{ textTransform: 'none', fontSize: '0.8125rem' }}
          >
            刷新
          </Button>
        </Box>
      </Box>

      {data && (
        <>
          {/* 顶部统计卡片 */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, mb: 2.5 }}>
            {[
              { label: '已使用技能', value: data.total, color: '#1F2937', hint: '在过去 ' + data.days + ' 天' },
              { label: '总调用次数', value: data.totalUses, color: '#7C3AED', hint: '累计触发' },
              { label: '活跃', value: data.statusBreakdown.active, color: '#059669', hint: '已启用' },
              { label: '可用', value: data.statusBreakdown.available, color: '#2563EB', hint: '可启用' },
            ].map((card) => (
              <Paper
                key={card.label}
                elevation={0}
                sx={{ p: 1.75, borderRadius: '12px', border: `1px solid ${gs.border}` }}
              >
                <Typography sx={{ fontSize: '0.6875rem', color: gs.textMuted, mb: 0.5 }}>
                  {card.label}
                </Typography>
                <Typography sx={{ fontSize: '1.5rem', fontWeight: 600, color: card.color, mb: 0.25 }}>
                  {card.value}
                </Typography>
                <Typography sx={{ fontSize: '0.6875rem', color: gs.textDisabled }}>
                  {card.hint}
                </Typography>
              </Paper>
            ))}
          </Box>

          {/* 趋势图 */}
          <Paper
            elevation={0}
            sx={{ p: 2, borderRadius: '12px', border: `1px solid ${gs.border}`, backgroundColor: gs.bgPanel, mb: 2.5 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <TrendingUpIcon sx={{ fontSize: 16, color: '#7C3AED' }} />
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: gs.textPrimary }}>
                调用趋势
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, ml: 'auto' }}>
                最高: {trendMax}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 120, mt: 2 }}>
              {data.trend.map((point) => {
                const heightPct = (point.count / trendMax) * 100;
                return (
                  <Box
                    key={point.date}
                    sx={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 0.5,
                    }}
                  >
                    <Typography sx={{ fontSize: '0.625rem', color: point.count > 0 ? gs.textPrimary : gs.textDisabled, fontWeight: point.count > 0 ? 600 : 400 }}>
                      {point.count}
                    </Typography>
                    <Box sx={{
                      width: '100%',
                      height: `${Math.max(heightPct, 2)}%`,
                      backgroundColor: point.count > 0 ? '#7C3AED' : '#E5E7EB',
                      borderRadius: '4px 4px 0 0',
                      transition: 'all 0.3s',
                      opacity: 0.85,
                    }} />
                    <Typography sx={{ fontSize: '0.625rem', color: gs.textMuted, whiteSpace: 'nowrap' }}>
                      {point.date.slice(5)}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Paper>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            {/* Top Skills 排行 */}
            <Paper
              elevation={0}
              sx={{ p: 2, borderRadius: '12px', border: `1px solid ${gs.border}`, backgroundColor: gs.bgPanel }}
            >
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: gs.textPrimary, mb: 1.5 }}>
                🏆 调用频次排行
              </Typography>
              {data.topSkills.length === 0 ? (
                <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted, textAlign: 'center', py: 4 }}>
                  暂无调用记录
                </Typography>
              ) : (
                <Box>
                  {data.topSkills.map((s) => {
                    const pct = (s.count / topMax) * 100;
                    return (
                      <Box
                        key={s.skillId}
                        onClick={() => navigate(`/skills/${encodeURIComponent(s.skillId)}`)}
                        sx={{
                          mb: 1, p: 1, borderRadius: '8px', cursor: 'pointer',
                          backgroundColor: 'transparent',
                          transition: 'background-color 0.15s',
                          '&:hover': { backgroundColor: gs.bgHover },
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                            <Box sx={{
                              width: 20, height: 20, borderRadius: '50%',
                              backgroundColor: s.rank <= 3 ? '#FEF3C7' : gs.bgHover,
                              color: s.rank <= 3 ? '#D97706' : gs.textMuted,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.625rem', fontWeight: 600, flexShrink: 0,
                            }}>
                              {s.rank}
                            </Box>
                            <Typography sx={{ fontSize: '0.8125rem', color: gs.textPrimary, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.skillId}
                            </Typography>
                            <OpenInNewIcon sx={{ fontSize: 11, color: gs.textDisabled, flexShrink: 0 }} />
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                              {s.uniqueSessions} 会话
                            </Typography>
                            <Typography sx={{ fontSize: '0.8125rem', color: '#7C3AED', fontWeight: 600, minWidth: 30, textAlign: 'right' }}>
                              {s.count}
                            </Typography>
                          </Box>
                        </Box>
                        <Box sx={{ position: 'relative' }}>
                          <LinearProgress
                            variant="determinate"
                            value={pct}
                            sx={{
                              height: 4, borderRadius: 2,
                              backgroundColor: gs.bgHover,
                              '& .MuiLinearProgress-bar': { backgroundColor: '#7C3AED', borderRadius: 2 },
                            }}
                          />
                        </Box>
                        <Typography sx={{ fontSize: '0.6875rem', color: gs.textDisabled, mt: 0.25 }}>
                          最近: {formatTime(s.lastUsedAt)}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Paper>

            {/* 高频共现组合 */}
            <Paper
              elevation={0}
              sx={{ p: 2, borderRadius: '12px', border: `1px solid ${gs.border}`, backgroundColor: gs.bgPanel }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <LinkIcon sx={{ fontSize: 16, color: '#7C3AED' }} />
                <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: gs.textPrimary }}>
                  高频共现组合
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mb: 1.5 }}>
                在同一会话中连续触发的技能对（不含相同技能）
              </Typography>
              {data.topCoOccurrence.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted, mb: 0.5 }}>
                    暂无共现数据
                  </Typography>
                  <Typography sx={{ fontSize: '0.6875rem', color: gs.textDisabled }}>
                    连续调用多个技能后会出现
                  </Typography>
                </Box>
              ) : (
                <Box>
                  {data.topCoOccurrence.map((co, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        p: 1, mb: 0.75, borderRadius: '6px',
                        backgroundColor: gs.bgHover,
                        display: 'flex', alignItems: 'center', gap: 1,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1, minWidth: 0 }}>
                        <Chip
                          label={co.skills[0]}
                          size="small"
                          onClick={() => navigate(`/skills/${encodeURIComponent(co.skills[0])}`)}
                          sx={{
                            height: 22, fontSize: '0.6875rem', cursor: 'pointer',
                            backgroundColor: '#FFFFFF', color: '#7C3AED',
                            border: '1px solid #7C3AED40',
                            '&:hover': { backgroundColor: '#F5F3FF' },
                          }}
                        />
                        <LinkIcon sx={{ fontSize: 14, color: gs.textMuted }} />
                        <Chip
                          label={co.skills[1]}
                          size="small"
                          onClick={() => navigate(`/skills/${encodeURIComponent(co.skills[1])}`)}
                          sx={{
                            height: 22, fontSize: '0.6875rem', cursor: 'pointer',
                            backgroundColor: '#FFFFFF', color: '#7C3AED',
                            border: '1px solid #7C3AED40',
                            '&:hover': { backgroundColor: '#F5F3FF' },
                          }}
                        />
                      </Box>
                      <Typography sx={{ fontSize: '0.75rem', color: '#7C3AED', fontWeight: 600, flexShrink: 0 }}>
                        ×{co.count}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>
          </Box>

          {/* 状态分布 */}
          {data.statusBreakdown.active + data.statusBreakdown.available + data.statusBreakdown.disabled + data.statusBreakdown.unknown > 0 && (
            <Paper
              elevation={0}
              sx={{ p: 2, borderRadius: '12px', border: `1px solid ${gs.border}`, backgroundColor: gs.bgPanel, mt: 2.5 }}
            >
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: gs.textPrimary, mb: 1.5 }}>
                状态分布
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
                {[
                  { key: 'active', label: '已启用', color: '#059669', icon: <CheckCircleIcon sx={{ fontSize: 16, color: '#059669' }} /> },
                  { key: 'available', label: '可用', color: '#2563EB' },
                  { key: 'disabled', label: '已禁用', color: '#9CA3AF' },
                  { key: 'unknown', label: '未分类', color: '#6B7280' },
                ].map((item) => {
                  const value = data.statusBreakdown[item.key as keyof typeof data.statusBreakdown];
                  const total = data.total || 1;
                  const pct = ((value / total) * 100).toFixed(1);
                  return (
                    <Box
                      key={item.key}
                      sx={{
                        p: 1.5, borderRadius: '8px',
                        backgroundColor: gs.bgHover,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        {item.icon}
                        <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                          {item.label}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: item.color, mb: 0.25 }}>
                        {value}
                      </Typography>
                      <Typography sx={{ fontSize: '0.6875rem', color: gs.textDisabled }}>
                        {pct}%
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Paper>
          )}
        </>
      )}
    </Box>
  );
};

export default SkillUsageAnalyticsPage;
