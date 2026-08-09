import React, { useState, useEffect } from 'react';
import { Box, Typography, Chip, Stack, Skeleton, Link } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { fetchSkillRecommendations, type SkillRecommendationItem } from '../../services/api';
import { getGrayScale } from '../../constants/theme';

const REASON_TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  cooccurrence: { label: '关联使用', color: '#7C3AED', bg: '#F3E8FF' },
  similarity: { label: '内容相似', color: '#0284C7', bg: '#F0F9FF' },
  trending: { label: '热门趋势', color: '#EA580C', bg: '#FFF7ED' },
  collaborative: { label: '协同过滤', color: '#059669', bg: '#ECFDF5' },
  category: { label: '同类推荐', color: '#DB2777', bg: '#FDF2F8' },
  default: { label: '默认推荐', color: '#6B7280', bg: '#F3F4F6' },
};

interface SkillRecommendationsPanelProps {
  skillId?: string;
  isDark?: boolean;
}

const SkillRecommendationsPanel: React.FC<SkillRecommendationsPanelProps> = ({ skillId, isDark = false }) => {
  const [recommendations, setRecommendations] = useState<SkillRecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const gs = getGrayScale(isDark);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSkillRecommendations({ skillId, topN: 6, days: 30 })
      .then((res) => {
        if (!cancelled) setRecommendations(res.recommendations);
      })
      .catch((e: any) => {
        // 推荐失败不中断用户体验：静默降级为空推荐，错误写入日志
        // （后端已保证 404/路由冲突等常见异常返回 200 空列表；此处兜底网络/解析错误）
        if (!cancelled) {
          console.warn('[SkillRecommendationsPanel] load failed, fallback to empty:', e?.message || e);
          setRecommendations([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [skillId]);

  if (loading) {
    return (
      <Stack spacing={1}>
        <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
      </Stack>
    );
  }

  if (recommendations.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
        暂无推荐数据（使用技能后将生成个性化推荐）
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      {recommendations.map((r) => {
        const typeInfo = REASON_TYPE_LABELS[r.reasonType] || REASON_TYPE_LABELS.collaborative;
        return (
          <Box
            key={r.skillId}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 1.25,
              borderRadius: 2,
              border: `1px solid ${gs.border}`,
              bgcolor: gs.bgPanel,
              cursor: 'pointer',
              '&:hover': { borderColor: gs.textMuted, bgcolor: gs.bgHover },
            }}
            onClick={() => navigate(`/skills/${encodeURIComponent(r.skillId)}`)}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Link
                component="span"
                sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary, textDecoration: 'none' }}
              >
                {r.skillName}
              </Link>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                {r.reason}
              </Typography>
            </Box>
            <Chip
              label={typeInfo.label}
              size="small"
              sx={{ bgcolor: typeInfo.bg, color: typeInfo.color, fontSize: '0.65rem', fontWeight: 600, height: 20 }}
            />
            <Typography variant="caption" sx={{ color: gs.textMuted, fontWeight: 700, minWidth: 28, textAlign: 'right' }}>
              {r.score}
            </Typography>
          </Box>
        );
      })}
    </Stack>
  );
};

export default SkillRecommendationsPanel;
