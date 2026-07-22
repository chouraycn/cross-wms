import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, CircularProgress, Paper, Button, Chip,
  LinearProgress, Tooltip, Collapse, IconButton,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SecurityIcon from '@mui/icons-material/Security';
import DescriptionIcon from '@mui/icons-material/Description';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import StorageIcon from '@mui/icons-material/Storage';
import { useToast } from '../contexts/ToastContext';
import { fetchSkillHealthCheck } from '../services/api';
import type { SkillHealthCheckItem } from '../services/api';
import { getGrayScale } from '../constants/theme';
import { usePageFadeIn } from '../hooks/usePageFadeIn';
import { useTranslation } from 'react-i18next';

const ScoreRing: React.FC<{ score: number; size?: number }> = ({ score, size = 48 }) => {
  const color = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#DC2626';
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <Box sx={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E5E7EB" strokeWidth={3} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color}
          strokeWidth={3} strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <Typography sx={{ position: 'absolute', fontSize: `${size * 0.28}px`, fontWeight: 700, color }}>
        {score}
      </Typography>
    </Box>
  );
};

const SkillHealthDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useTranslation('skills');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ summary: { total: number; healthy: number; warning: number; critical: number; avgScore: number }; skills: SkillHealthCheckItem[] } | null>(null);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'healthy' | 'warning' | 'critical'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSkillHealthCheck();
      setData(res);
    } catch (e) {
      showToast(`加载健康度数据失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const isDark = false;
  const gs = getGrayScale(isDark);
  const fadeCls = usePageFadeIn();

  const filteredSkills = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data.skills;
    if (filter === 'healthy') return data.skills.filter((s) => s.overallScore >= 80);
    if (filter === 'warning') return data.skills.filter((s) => s.overallScore >= 60 && s.overallScore < 80);
    return data.skills.filter((s) => s.overallScore < 60);
  }, [data, filter]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return { bg: '#ECFDF5', border: '#10B981', text: '#047857', icon: <CheckCircleIcon sx={{ fontSize: 14, color: '#10B981' }} /> };
    if (score >= 60) return { bg: '#FEF3C7', border: '#F59E0B', text: '#B45309', icon: <WarningAmberIcon sx={{ fontSize: 14, color: '#F59E0B' }} /> };
    return { bg: '#FEF2F2', border: '#DC2626', text: '#B91C1C', icon: <ErrorOutlineIcon sx={{ fontSize: 14, color: '#DC2626' }} /> };
  };

  if (loading && !data) {
    return (
      <Box className={fadeCls} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 1.5 }}>
        <CircularProgress size={20} sx={{ color: gs.textMuted }} />
        <Typography sx={{ fontSize: '0.875rem', color: gs.textMuted }}>加载健康度检查...</Typography>
      </Box>
    );
  }

  return (
    <Box className={fadeCls} sx={{ p: 1 }}>
      {/* 顶部标题栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <HealthAndSafetyIcon sx={{ fontSize: 20, color: '#10B981' }} />
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: gs.textPrimary }}>
              技能健康度仪表盘
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted }}>
            综合检查技能元数据、依赖声明、文档质量与安全合规
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
          onClick={load}
          disabled={loading}
          sx={{ textTransform: 'none', fontSize: '0.8125rem' }}
        >
          重新检查
        </Button>
      </Box>

      {data && (
        <>
          {/* 汇总卡片 */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1.5, mb: 2.5 }}>
            {[
              { label: '平均健康分', value: data.summary.avgScore, color: data.summary.avgScore >= 80 ? '#10B981' : data.summary.avgScore >= 60 ? '#F59E0B' : '#DC2626', suffix: '分' },
              { label: '健康', value: data.summary.healthy, color: '#10B981', suffix: '个' },
              { label: '警告', value: data.summary.warning, color: '#F59E0B', suffix: '个' },
              { label: '危险', value: data.summary.critical, color: '#DC2626', suffix: '个' },
              { label: '总计', value: data.summary.total, color: '#1F2937', suffix: '个' },
            ].map((card) => (
              <Paper key={card.label} elevation={0} sx={{ p: 1.5, borderRadius: '10px', border: `1px solid ${gs.border}` }}>
                <Typography sx={{ fontSize: '0.6875rem', color: gs.textMuted, mb: 0.5 }}>{card.label}</Typography>
                <Typography sx={{ fontSize: '1.5rem', fontWeight: 600, color: card.color }}>
                  {card.value}<Typography component="span" sx={{ fontSize: '0.75rem', color: gs.textMuted, ml: 0.25 }}>{card.suffix}</Typography>
                </Typography>
              </Paper>
            ))}
          </Box>

          {/* 过滤器 */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
            <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted, mr: 1 }}>筛选:</Typography>
            {[
              { key: 'all', label: `全部 (${data.summary.total})`, color: gs.textPrimary },
              { key: 'healthy', label: `健康 (${data.summary.healthy})`, color: '#10B981' },
              { key: 'warning', label: `警告 (${data.summary.warning})`, color: '#F59E0B' },
              { key: 'critical', label: `危险 (${data.summary.critical})`, color: '#DC2626' },
            ].map((f) => {
              const isActive = filter === f.key;
              return (
                <Chip
                  key={f.key}
                  label={f.label}
                  size="small"
                  onClick={() => setFilter(f.key as any)}
                  sx={{
                    cursor: 'pointer', fontSize: '0.75rem', height: 26,
                    backgroundColor: isActive ? f.color : 'transparent',
                    color: isActive ? '#FFFFFF' : f.color,
                    border: `1px solid ${f.color}`,
                    '&:hover': { backgroundColor: isActive ? f.color : `${f.color}20` },
                  }}
                />
              );
            })}
          </Box>

          {/* 技能列表 */}
          <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${gs.border}`, backgroundColor: gs.bgPanel, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${gs.border}`, display: 'grid', gridTemplateColumns: '280px 1fr 80px', gap: 2, alignItems: 'center' }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textMuted }}>技能</Typography>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textMuted }}>检查项</Typography>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textMuted, textAlign: 'right' }}>总分</Typography>
            </Box>
            {filteredSkills.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <Typography sx={{ fontSize: '0.875rem', color: gs.textMuted }}>无匹配结果</Typography>
              </Box>
            ) : (
              filteredSkills.map((skill) => {
                const colors = getScoreColor(skill.overallScore);
                const isExpanded = expandedSkill === skill.skillId;
                return (
                  <Box key={skill.skillId} sx={{ borderBottom: `1px solid ${gs.border}`, '&:last-child': { borderBottom: 'none' } }}>
                    <Box
                      onClick={() => setExpandedSkill(isExpanded ? null : skill.skillId)}
                      sx={{
                        px: 2, py: 1.5, cursor: 'pointer',
                        display: 'grid', gridTemplateColumns: '280px 1fr 80px', gap: 2, alignItems: 'center',
                        backgroundColor: isExpanded ? gs.bgHover : 'transparent',
                        transition: 'background-color 0.15s',
                        '&:hover': { backgroundColor: gs.bgHover },
                      }}
                    >
                      {/* 技能名 */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {colors.icon}
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: gs.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {skill.name}
                          </Typography>
                          <Typography sx={{ fontSize: '0.6875rem', color: gs.textMuted }}>{skill.skillId}</Typography>
                        </Box>
                      </Box>

                      {/* 检查项 */}
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        {[
                          { key: 'metadata', label: '元数据', icon: <StorageIcon sx={{ fontSize: 12 }} />, score: skill.checks.metadata.score },
                          { key: 'dependencies', label: '依赖', icon: <AccountTreeIcon sx={{ fontSize: 12 }} />, score: skill.checks.dependencies.score },
                          { key: 'documentation', label: '文档', icon: <DescriptionIcon sx={{ fontSize: 12 }} />, score: skill.checks.documentation.score },
                          { key: 'security', label: '安全', icon: <SecurityIcon sx={{ fontSize: 12 }} />, score: skill.checks.security.score },
                        ].map((c) => (
                          <Tooltip key={c.key} title={`${c.label}: ${c.score}分`}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                              <Box sx={{ color: c.score >= 75 ? '#10B981' : c.score >= 60 ? '#F59E0B' : '#DC2626' }}>
                                {c.icon}
                              </Box>
                              <LinearProgress
                                variant="determinate"
                                value={c.score}
                                sx={{
                                  width: 40, height: 4, borderRadius: 2,
                                  backgroundColor: '#E5E7EB',
                                  '& .MuiLinearProgress-bar': {
                                    backgroundColor: c.score >= 75 ? '#10B981' : c.score >= 60 ? '#F59E0B' : '#DC2626',
                                    borderRadius: 2,
                                  },
                                }}
                              />
                            </Box>
                          </Tooltip>
                        ))}
                      </Box>

                      {/* 总分 */}
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                        <ScoreRing score={skill.overallScore} size={40} />
                        <IconButton size="small" sx={{ p: 0.25 }}>
                          {isExpanded ? <ExpandLessIcon sx={{ fontSize: 18, color: gs.textMuted }} /> : <ExpandMoreIcon sx={{ fontSize: 18, color: gs.textMuted }} />}
                        </IconButton>
                      </Box>
                    </Box>

                    {/* 展开详情 */}
                    <Collapse in={isExpanded}>
                      <Box sx={{ px: 2, pb: 2, pt: 1, backgroundColor: gs.bgHover }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                          {[
                              { key: 'metadata', label: t('health.detail.metaCompleteness'), check: skill.checks.metadata },
                              { key: 'dependencies', label: t('health.detail.depDeclarations'), check: skill.checks.dependencies },
                              { key: 'documentation', label: t('health.detail.docQuality'), check: skill.checks.documentation },
                              { key: 'security', label: t('health.detail.securityCompliance'), check: skill.checks.security },
                            ].map((c) => (
                            <Box key={c.key} sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#FFFFFF', border: `1px solid ${gs.border}` }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
                                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textPrimary }}>{c.label}</Typography>
                                <Chip
                                  label={c.check.pass ? '通过' : '未通过'}
                                  size="small"
                                  sx={{
                                    height: 18, fontSize: '0.625rem',
                                    backgroundColor: c.check.pass ? '#ECFDF5' : '#FEF2F2',
                                    color: c.check.pass ? '#047857' : '#B91C1C',
                                  }}
                                />
                              </Box>
                              <LinearProgress
                                variant="determinate"
                                value={c.check.score}
                                sx={{
                                  height: 5, borderRadius: 3, mb: 1,
                                  backgroundColor: '#E5E7EB',
                                  '& .MuiLinearProgress-bar': {
                                    backgroundColor: c.check.score >= 75 ? '#10B981' : c.check.score >= 60 ? '#F59E0B' : '#DC2626',
                                    borderRadius: 3,
                                  },
                                }}
                              />
                              {c.check.issues.length > 0 ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                                  {c.check.issues.map((issue, idx) => (
                                    <Typography key={idx} sx={{ fontSize: '0.6875rem', color: '#B91C1C' }}>
                                      • {issue}
                                    </Typography>
                                  ))}
                                </Box>
                              ) : (
                                <Typography sx={{ fontSize: '0.6875rem', color: '#059669' }}>
                                  ✓ 无问题
                                </Typography>
                              )}
                            </Box>
                          ))}
                        </Box>
                        <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
                          <Button
                            size="small"
                            onClick={() => navigate(`/skills/${encodeURIComponent(skill.skillId)}`)}
                            sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                          >
                            查看技能详情 →
                          </Button>
                        </Box>
                      </Box>
                    </Collapse>
                  </Box>
                );
              })
            )}
          </Paper>
        </>
      )}
    </Box>
  );
};

export default SkillHealthDashboardPage;
