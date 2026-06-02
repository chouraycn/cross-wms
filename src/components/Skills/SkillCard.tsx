import React from 'react';
import {
  Box, Typography, Chip, IconButton, Tooltip, CircularProgress, Paper,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { ICON_MAP } from '../../types/skill';
import type { Skill } from '../../types/skill';
import { ICON_GRADIENTS } from '../../constants/skillCategories';
import type { TaskType, AutomationExecution } from '../../services/automation';

// ===================== 类型 =====================

export interface SkillCardProps {
  skill: Skill;
  automationInfo?: { active: boolean; id: string; name: string };
  isRunning: boolean;
  isTriggering: boolean;
  latestExec: AutomationExecution | null;
  onNavigate: (skillId: string) => void;
  onTrigger: (skill: Skill, e: React.MouseEvent) => void;
  onActivate: (id: string, e: React.MouseEvent) => void;
}

// ===================== 最近执行状态 =====================

const renderLatestExec = (exec: AutomationExecution | null) => {
  if (!exec) return null;
  const statusIcon = exec.status === 'success'
    ? <CheckCircleIcon sx={{ fontSize: 10, color: '#059669' }} />
    : exec.status === 'failed'
      ? <ErrorOutlineIcon sx={{ fontSize: 10, color: '#DC2626' }} />
      : <ScheduleIcon sx={{ fontSize: 10, color: '#D97706' }} />;
  const statusText = exec.status === 'success' ? '成功' : exec.status === 'failed' ? '失败' : '运行中';
  const timeStr = exec.completedAt
    ? new Date(exec.completedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
      {statusIcon}
      <Typography sx={{ fontSize: '0.6rem', color: '#999' }}>
        {statusText}{timeStr ? ` · ${timeStr}` : ''}
      </Typography>
    </Box>
  );
};

// ===================== 技能卡片组件 =====================

const SkillCard: React.FC<SkillCardProps> = ({
  skill,
  automationInfo,
  isRunning,
  isTriggering,
  latestExec,
  onNavigate,
  onTrigger,
  onActivate,
}) => {
  const hasAutomation = !!automationInfo;

  return (
    <Paper
      elevation={0}
      onClick={() => onNavigate(skill.id)}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        p: 2,
        borderRadius: '12px',
        border: '1px solid #F0F0F0',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        '&:hover': {
          backgroundColor: 'rgba(0,0,0,0.04)',
        },
      }}
    >
      {/* 图标区 */}
      <Box sx={{
        width: 44,
        height: 44,
        borderRadius: '10px',
        background: ICON_GRADIENTS[skill.category],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        mr: 1.5,
        flexShrink: 0,
        position: 'relative',
        color: '#fff',
        fontSize: '1.1rem',
        fontWeight: 600,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', '& .MuiSvgIcon-root': { fontSize: 22, color: '#fff' } }}>
          {ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 22 }} />}
        </Box>
        {hasAutomation && (
          <Box sx={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: isRunning ? '#3B82F6' : '#10B981',
            border: '2px solid #fff',
            ...(isRunning ? { animation: 'pulse-dot 1.2s ease-in-out infinite' } : {}),
          }} />
        )}
      </Box>

      {/* 信息区 */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
          <Typography sx={{
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#1A1A1A',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {skill.name}
          </Typography>
          {skill.status === 'available' && (
            <Chip
              label="可用"
              size="small"
              sx={{ height: 16, fontSize: '0.55rem', fontWeight: 500, backgroundColor: '#EFF6FF', color: '#2563EB' }}
            />
          )}
          {skill.status === 'coming' && (
            <Chip
              label="即将上线"
              size="small"
              sx={{ height: 16, fontSize: '0.55rem', fontWeight: 500, backgroundColor: '#FEF3C7', color: '#D97706' }}
            />
          )}
          {skill.source === 'user' && (
            <Chip
              label="自定义"
              size="small"
              sx={{ height: 16, fontSize: '0.55rem', fontWeight: 500, backgroundColor: '#FAF5FF', color: '#7C3AED' }}
            />
          )}
        </Box>
        <Typography sx={{
          fontSize: '0.75rem',
          color: '#999',
          lineHeight: 1.5,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {skill.desc}
        </Typography>
        {renderLatestExec(latestExec)}
      </Box>

      {/* 操作按钮 */}
      {skill.status === 'available' ? (
        <Tooltip title="启用技能">
          <IconButton
            size="small"
            onClick={(e) => onActivate(skill.id, e)}
            sx={{
              flexShrink: 0,
              width: 28,
              height: 28,
              border: '1px solid #E0E0E0',
              borderRadius: '6px',
              backgroundColor: '#fff',
              ml: 1,
              color: '#2563EB',
              '&:hover': { backgroundColor: '#F5F5F5', borderColor: '#D0D0D0' },
            }}
          >
            <PlayArrowIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      ) : hasAutomation ? (
        <Tooltip title={isRunning ? '执行中...' : '立即执行'}>
          <IconButton
            size="small"
            onClick={(e) => onTrigger(skill, e)}
            disabled={isRunning || isTriggering}
            sx={{
              flexShrink: 0,
              width: 28,
              height: 28,
              border: '1px solid #E0E0E0',
              borderRadius: '6px',
              backgroundColor: '#fff',
              ml: 1,
              color: isRunning ? '#2563EB' : '#059669',
              '&:hover': { backgroundColor: '#F5F5F5', borderColor: '#D0D0D0' },
            }}
          >
            {isRunning || isTriggering ? (
              <CircularProgress size={14} sx={{ color: '#2563EB' }} />
            ) : (
              <PlayArrowIcon sx={{ fontSize: 14 }} />
            )}
          </IconButton>
        </Tooltip>
      ) : (
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); onNavigate(skill.id); }}
          sx={{
            flexShrink: 0,
            width: 28,
            height: 28,
            border: '1px solid #E0E0E0',
            borderRadius: '6px',
            backgroundColor: '#fff',
            ml: 1,
            color: '#666',
            '&:hover': { backgroundColor: '#F5F5F5', borderColor: '#D0D0D0' },
          }}
        >
          <AddIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
    </Paper>
  );
};

export default SkillCard;

// 用于类型重导出
export type { TaskType };
