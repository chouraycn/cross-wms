/**
 * SkillMatchResult — 匹配结果展示组件
 *
 * 两个模式：
 * 1. 高置信度（≥0.7）：自动激活，显示匹配原因 + 置信度进度条
 * 2. 中置信度（0.4-0.7）：展示候选列表，用户手动选择
 */

import React from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Button,
  Paper,
  Chip,
  IconButton,
  Collapse,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import CloseIcon from '@mui/icons-material/Close';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import { ICON_MAP } from '../../types/skill';
import type { Skill } from '../../types/skill';
import { getAllSkills } from '../../stores/skillStore';

// ===================== 类型 =====================

/** 语义匹配结果项（前端展示用） */
export interface SemanticMatchResult {
  skillId: string;
  skillName: string;
  confidence: number;
  reasons: string[];
  matchMode: string;
}

export interface SkillMatchResultProps {
  /** 匹配结果列表 */
  matches: SemanticMatchResult[];
  /** 选中技能回调 */
  onSelect: (skillId: string) => void;
  /** 关闭/忽略回调 */
  onDismiss: () => void;
}

// ===================== 置信度颜色 =====================

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.7) return '#059669'; // 高 — 绿色
  if (confidence >= 0.4) return '#D97706'; // 中 — 橙色
  return '#DC2626'; // 低 — 红色
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.7) return '高置信度';
  if (confidence >= 0.4) return '中置信度';
  return '低置信度';
}

/** 根据 skillId 获取完整 Skill 对象 */
function getSkillById(skillId: string): Skill | undefined {
  return getAllSkills().find(s => s.id === skillId);
}

// ===================== 单个匹配卡片 =====================

interface MatchCardProps {
  match: SemanticMatchResult;
  isAutoActivated: boolean;
  onSelect: (skillId: string) => void;
  showSelectButton: boolean;
}

const MatchCard: React.FC<MatchCardProps> = ({ match, isAutoActivated, onSelect, showSelectButton }) => {
  const [expanded, setExpanded] = React.useState(isAutoActivated);
  const skill = getSkillById(match.skillId);
  const confidencePercent = Math.round(match.confidence * 100);
  const color = getConfidenceColor(match.confidence);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        mb: 1,
        borderRadius: '8px',
        border: `1px solid ${isAutoActivated ? '#BBF7D0' : '#E5E7EB'}`,
        bgcolor: isAutoActivated ? '#F0FDF4' : '#FAFAFA',
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: isAutoActivated ? '#86EFAC' : '#D1D5DB',
        },
      }}
    >
      {/* 头部：技能图标 + 名称 + 置信度 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
        {/* 图标 */}
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: isAutoActivated ? '#DCFCE7' : '#F3F4F6',
            color: isAutoActivated ? '#059669' : '#6B7280',
            flexShrink: 0,
            '& .MuiSvgIcon-root': { fontSize: 18 },
          }}
        >
          {skill ? (ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 18 }} />) : <AutoFixHighIcon sx={{ fontSize: 18 }} />}
        </Box>

        {/* 名称 + 置信度标签 */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography
              sx={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#111827',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {match.skillName}
            </Typography>
            {isAutoActivated && (
              <Chip
                icon={<CheckCircleOutlineIcon sx={{ fontSize: '12px !important' }} />}
                label="已自动激活"
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.625rem',
                  bgcolor: '#DCFCE7',
                  color: '#059669',
                  border: '1px solid #BBF7D0',
                  '& .MuiChip-icon': { color: '#059669' },
                }}
              />
            )}
          </Box>

          {/* 置信度进度条 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            <LinearProgress
              variant="determinate"
              value={confidencePercent}
              sx={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                bgcolor: '#F3F4F6',
                '& .MuiLinearProgress-bar': {
                  bgcolor: color,
                  borderRadius: 2,
                },
              }}
            />
            <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color, flexShrink: 0, width: 36, textAlign: 'right' }}>
              {confidencePercent}%
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* 匹配原因（可折叠） */}
      {match.reasons.length > 0 && (
        <Box sx={{ mt: 0.5 }}>
          <Typography
            onClick={() => setExpanded(prev => !prev)}
            sx={{
              fontSize: '0.6875rem',
              color: '#6B7280',
              cursor: 'pointer',
              '&:hover': { color: '#374151' },
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.25,
            }}
          >
            {expanded ? '收起原因' : '查看匹配原因'}
            <Box component="span" sx={{ fontSize: '0.625rem', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>
              ▼
            </Box>
          </Typography>
          <Collapse in={expanded}>
            <Box sx={{ mt: 0.5, pl: 1, borderLeft: '2px solid #E5E7EB' }}>
              {match.reasons.map((reason, idx) => (
                <Typography key={idx} sx={{ fontSize: '0.6875rem', color: '#6B7280', lineHeight: 1.5 }}>
                  • {reason}
                </Typography>
              ))}
            </Box>
          </Collapse>
        </Box>
      )}

      {/* 选择按钮（中置信度时显示） */}
      {showSelectButton && !isAutoActivated && (
        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            size="small"
            startIcon={<TouchAppIcon sx={{ fontSize: 14 }} />}
            onClick={() => onSelect(match.skillId)}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              color: '#2563EB',
              '&:hover': { bgcolor: '#EFF6FF' },
            }}
          >
            使用此技能
          </Button>
        </Box>
      )}
    </Paper>
  );
};

// ===================== 主组件 =====================

const SkillMatchResult: React.FC<SkillMatchResultProps> = ({ matches, onSelect, onDismiss }) => {
  if (matches.length === 0) return null;

  // 区分高置信度和中置信度
  const highConfidence = matches.filter(m => m.confidence >= 0.7);
  const mediumConfidence = matches.filter(m => m.confidence >= 0.4 && m.confidence < 0.7);

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: '10px',
        border: '1px solid #E5E7EB',
        bgcolor: '#FFFFFF',
        overflow: 'hidden',
        maxWidth: 400,
      }}
    >
      {/* 标题栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, borderBottom: '1px solid #F3F4F6' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <AutoFixHighIcon sx={{ fontSize: 16, color: '#7C3AED' }} />
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>
            技能匹配结果
          </Typography>
        </Box>
        <IconButton size="small" onClick={onDismiss} sx={{ p: 0.25 }}>
          <CloseIcon sx={{ fontSize: 14, color: '#9CA3AF' }} />
        </IconButton>
      </Box>

      {/* 匹配结果列表 */}
      <Box sx={{ px: 1.5, py: 1 }}>
        {/* 高置信度（自动激活） */}
        {highConfidence.map(match => (
          <MatchCard
            key={match.skillId}
            match={match}
            isAutoActivated={true}
            onSelect={onSelect}
            showSelectButton={false}
          />
        ))}

        {/* 中置信度（候选列表） */}
        {mediumConfidence.length > 0 && highConfidence.length > 0 && (
          <Typography sx={{ fontSize: '0.6875rem', color: '#9CA3AF', fontWeight: 500, mt: 1, mb: 0.5, px: 0.5 }}>
            候选技能
          </Typography>
        )}
        {mediumConfidence.map(match => (
          <MatchCard
            key={match.skillId}
            match={match}
            isAutoActivated={false}
            onSelect={onSelect}
            showSelectButton={true}
          />
        ))}
      </Box>

      {/* 底部提示 */}
      <Box sx={{ px: 2, py: 1, bgcolor: '#FAFAFA', borderTop: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <TipsAndUpdatesIcon sx={{ fontSize: 12, color: '#D97706' }} />
        <Typography sx={{ fontSize: '0.625rem', color: '#9CA3AF' }}>
          更详细的描述可获得更精准的匹配
        </Typography>
      </Box>
    </Paper>
  );
};

export default SkillMatchResult;
