import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, CircularProgress, Button, Chip,
  Stack, Divider, LinearProgress, Accordion, AccordionSummary, AccordionDetails,
  IconButton, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ErrorIcon from '@mui/icons-material/Error';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoIcon from '@mui/icons-material/Info';
import { useToast } from '../contexts/ToastContext';
import { fetchDocQualityCheck, type DocQualityResult, type DocQualitySkillItem } from '../services/api';
import { getGrayScale } from '../constants/theme';

const LEVEL_COLORS: Record<string, { text: string; bg: string; label: string }> = {
  excellent: { text: '#059669', bg: '#DCFCE7', label: '优秀' },
  good: { text: '#2563EB', bg: '#DBEAFE', label: '良好' },
  fair: { text: '#CA8A04', bg: '#FEF9C3', label: '一般' },
  poor: { text: '#DC2626', bg: '#FEE2E2', label: '较差' },
};

const CHECK_LABELS: Record<string, string> = {
  structure: '结构完整性',
  readability: '可读性',
  examples: '示例完整性',
  parameters: '参数说明',
  formatting: '格式规范',
};

const CHECK_ICONS: Record<string, React.ReactNode> = {
  structure: <MenuBookIcon sx={{ fontSize: 18 }} />,
  readability: <InfoIcon sx={{ fontSize: 18 }} />,
  examples: <CheckCircleIcon sx={{ fontSize: 18 }} />,
  parameters: <MenuBookIcon sx={{ fontSize: 18 }} />,
  formatting: <CheckCircleIcon sx={{ fontSize: 18 }} />,
};

const SummaryCard: React.FC<{ title: string; value: number; color: string; bg: string }> = ({ title, value, color, bg }) => (
  <Paper sx={{ p: 2, textAlign: 'center', minWidth: 100, bgcolor: bg, borderRadius: 2 }}>
    <Typography variant="h5" sx={{ fontWeight: 700, color }}>{value}</Typography>
    <Typography variant="caption" sx={{ color, opacity: 0.8 }}>{title}</Typography>
  </Paper>
);

const ScoreRing: React.FC<{ score: number; size?: number }> = ({ score, size = 60 }) => {
  const color = score >= 80 ? '#059669' : score >= 60 ? '#CA8A04' : '#DC2626';
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', width: size, height: size }}>
      <CircularProgress variant="determinate" value={score} size={size} thickness={5} sx={{ color }} />
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color, fontSize: '0.75rem' }}>{score}</Typography>
      </Box>
    </Box>
  );
};

const SkillDocQualityPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [data, setData] = useState<DocQualityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'excellent' | 'good' | 'fair' | 'poor'>('all');
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const gs = getGrayScale(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchDocQualityCheck();
      setData(res);
    } catch (e: any) {
      showToast(`加载失败: ${e?.message || e}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredSkills = data?.skills.filter((s) => filter === 'all' || s.level === filter) || [];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!data) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">暂无数据</Typography>
        <Button variant="outlined" onClick={load} sx={{ mt: 2 }} startIcon={<RefreshIcon />}>重试</Button>
      </Box>
    );
  }

  const { summary } = data;

  return (
    <Box sx={{ p: 3, maxWidth: 960, mx: 'auto' }}>
      {/* 返回按钮 */}
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
        返回
      </Button>

      {/* 标题栏 */}
      <Paper sx={{ p: 3, mb: 2, borderRadius: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>技能文档质量检查</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              基于五维评分体系自动化检查 SKILL.md 文档质量
            </Typography>
          </Box>
          <IconButton onClick={load} title="刷新" disabled={loading}><RefreshIcon /></IconButton>
        </Stack>
      </Paper>

      {/* 汇总卡片 */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2, overflowX: 'auto', pb: 0.5 }}>
        <SummaryCard title="总计" value={summary.total} color="#374151" bg="#F3F4F6" />
        <SummaryCard title="优秀" value={summary.excellent} color="#059669" bg="#DCFCE7" />
        <SummaryCard title="良好" value={summary.good} color="#2563EB" bg="#DBEAFE" />
        <SummaryCard title="一般" value={summary.fair} color="#CA8A04" bg="#FEF9C3" />
        <SummaryCard title="较差" value={summary.poor} color="#DC2626" bg="#FEE2E2" />
        <SummaryCard title="平均分" value={summary.avgScore} color="#7C3AED" bg="#F3E8FF" />
      </Stack>

      {/* 状态筛选 */}
      <ToggleButtonGroup
        value={filter}
        exclusive
        onChange={(_, v) => v && setFilter(v)}
        size="small"
        sx={{ mb: 2 }}
      >
        <ToggleButton value="all">全部</ToggleButton>
        <ToggleButton value="excellent">优秀</ToggleButton>
        <ToggleButton value="good">良好</ToggleButton>
        <ToggleButton value="fair">一般</ToggleButton>
        <ToggleButton value="poor">较差</ToggleButton>
      </ToggleButtonGroup>

      {/* 技能列表 */}
      <Stack spacing={1.5}>
        {filteredSkills.map((skill) => (
          <SkillQualityCard
            key={skill.skillId}
            skill={skill}
            expanded={expandedSkill === skill.skillId}
            onToggle={() => setExpandedSkill(expandedSkill === skill.skillId ? null : skill.skillId)}
            gs={gs}
          />
        ))}
        {filteredSkills.length === 0 && (
          <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
            <Typography variant="body2" color="text.secondary">该分类下暂无技能</Typography>
          </Paper>
        )}
      </Stack>
    </Box>
  );
};

const SkillQualityCard: React.FC<{
  skill: DocQualitySkillItem;
  expanded: boolean;
  onToggle: () => void;
  gs: ReturnType<typeof getGrayScale>;
}> = ({ skill, expanded, onToggle, gs }) => {
  const levelInfo = LEVEL_COLORS[skill.level] || LEVEL_COLORS.poor;

  return (
    <Accordion expanded={expanded} onChange={onToggle} sx={{ borderRadius: 2, overflow: 'hidden', '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2, py: 0.5 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ flex: 1, minWidth: 0 }}>
          <ScoreRing score={skill.overallScore} size={48} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {skill.skillName}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              {skill.skillId}
            </Typography>
          </Box>
          <Chip
            label={levelInfo.label}
            size="small"
            sx={{ bgcolor: levelInfo.bg, color: levelInfo.text, fontWeight: 600, fontSize: '0.7rem' }}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2, pb: 2 }}>
        <Divider sx={{ mb: 2 }} />
        <Stack spacing={2}>
          {Object.entries(skill.checks).map(([key, check]) => (
            <CheckDetail key={key} label={CHECK_LABELS[key] || key} check={check} gs={gs} />
          ))}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};

const CheckDetail: React.FC<{
  label: string;
  check: DocQualitySkillItem['checks'][keyof DocQualitySkillItem['checks']];
  gs: ReturnType<typeof getGrayScale>;
}> = ({ label, check, gs }) => {
  const color = check.pass ? '#059669' : check.score >= 60 ? '#CA8A04' : '#DC2626';

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        {check.pass ? (
          <CheckCircleIcon sx={{ fontSize: 16, color: '#059669' }} />
        ) : check.score >= 60 ? (
          <WarningAmberIcon sx={{ fontSize: 16, color: '#CA8A04' }} />
        ) : (
          <ErrorIcon sx={{ fontSize: 16, color: '#DC2626' }} />
        )}
        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>{label}</Typography>
        <Typography variant="caption" sx={{ color, fontWeight: 700 }}>{check.score}分</Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={check.score}
        sx={{
          height: 6,
          borderRadius: 3,
          bgcolor: gs.border,
          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 },
        }}
      />
      {check.issues.length > 0 && (
        <Box sx={{ mt: 0.75, pl: 2.5 }}>
          {check.issues.map((issue, i) => (
            <Box key={i} sx={{ mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: issue.severity === 'error' ? '#DC2626' : issue.severity === 'warning' ? '#CA8A04' : '#3B82F6', display: 'block' }}>
                • {issue.message}
              </Typography>
              {issue.fix && (
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', pl: 1.5, mt: 0.25 }}>
                  → {issue.fix}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}
      {check.suggestions.length > 0 && (
        <Box sx={{ mt: 0.5, pl: 2.5 }}>
          {check.suggestions.map((s, i) => (
            <Typography key={i} variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              ◦ {s}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default SkillDocQualityPage;
