import React from 'react';
import {
  Box, Typography, Chip, Button, Paper, CircularProgress,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import type { Skill } from '../../types/skill';
import type { AutomationExecution } from '../../services/automation';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../../constants/skillCategories';

// ===================== 类型 =====================

export interface SkillInfoCardsProps {
  skill: Skill;
  autoInfo?: { active: boolean; id: string; name: string };
  hasAutomation: boolean;
  isRunning: boolean;
  isTriggering: boolean;
  latestExec: AutomationExecution | null;
  onTriggerAutomation: () => void;
  onNavigateAutomation: () => void;
}

// ===================== 技能信息卡片组 =====================

const SkillInfoCards: React.FC<SkillInfoCardsProps> = ({
  skill,
  autoInfo,
  hasAutomation,
  isRunning,
  isTriggering,
  latestExec,
  onTriggerAutomation,
  onNavigateAutomation,
}) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
      {/* 基本信息卡片 */}
      <Paper elevation={0} sx={{ borderRadius: 2, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
        <Box sx={{ px: 2.5, py: 1.5, backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
            基本信息
          </Typography>
        </Box>
        <Box sx={{ px: 2.5, py: 2 }}>
          <Typography sx={{ fontSize: '0.8125rem', color: '#374151', lineHeight: 1.7, mb: 2 }}>
            {skill.detail || skill.desc}
          </Typography>

          {skill.trigger && (
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', mb: 0.5 }}>
                触发方式
              </Typography>
              <Paper elevation={0} sx={{ px: 1.5, py: 1, borderRadius: 1, backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#374151', fontFamily: 'monospace' }}>
                  {skill.trigger}
                </Typography>
              </Paper>
            </Box>
          )}

          {skill.shortcut && (
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', mb: 0.5 }}>
                快捷方式
              </Typography>
              <Paper elevation={0} sx={{ px: 1.5, py: 1, borderRadius: 1, backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#374151', fontFamily: 'monospace' }}>
                  {skill.shortcut}
                </Typography>
              </Paper>
            </Box>
          )}

          {skill.tags && skill.tags.length > 0 && (
            <Box>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', mb: 0.5 }}>
                标签
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {skill.tags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    sx={{ height: 22, fontSize: '0.65rem', backgroundColor: '#F3F4F6', color: '#6B7280' }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Paper>

      {/* 关联自动化卡片 */}
      {skill.automationTaskType && (
        <Paper elevation={0} sx={{ borderRadius: 2, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, py: 1.5, backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
              关联自动化
            </Typography>
          </Box>
          <Box sx={{ px: 2.5, py: 2 }}>
            {autoInfo ? (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>
                      {autoInfo.name}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: autoInfo.active ? '#059669' : '#D97706' }} />
                      <Typography sx={{ fontSize: '0.7rem', color: autoInfo.active ? '#059669' : '#D97706' }}>
                        {autoInfo.active ? '运行中' : '已暂停'}
                      </Typography>
                    </Box>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={isRunning || isTriggering ? <CircularProgress size={14} sx={{ color: '#059669' }} /> : <PlayArrowIcon sx={{ fontSize: 14 }} />}
                    onClick={onTriggerAutomation}
                    disabled={isRunning || isTriggering}
                    sx={{
                      fontSize: '0.7rem',
                      textTransform: 'none',
                      borderColor: '#059669',
                      color: '#059669',
                      '&:hover': { borderColor: '#047857', backgroundColor: '#ECFDF5' },
                    }}
                  >
                    {isRunning || isTriggering ? '执行中...' : '立即执行'}
                  </Button>
                </Box>

                {latestExec ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
                    {latestExec.status === 'success'
                      ? <CheckCircleIcon sx={{ fontSize: 14, color: '#059669' }} />
                      : latestExec.status === 'failed'
                        ? <ErrorOutlineIcon sx={{ fontSize: 14, color: '#DC2626' }} />
                        : <ScheduleIcon sx={{ fontSize: 14, color: '#D97706' }} />}
                    <Typography sx={{ fontSize: '0.7rem', color: '#6B7280' }}>
                      最近执行: {latestExec.status === 'success' ? '成功' : latestExec.status === 'failed' ? '失败' : '运行中'}
                      {latestExec.completedAt ? ` · ${new Date(latestExec.completedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                    </Typography>
                  </Box>
                ) : (
                  <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', mb: 1.5 }}>
                    暂无执行记录
                  </Typography>
                )}

                <Button
                  size="small"
                  onClick={onNavigateAutomation}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.7rem',
                    color: '#6B7280',
                    '&:hover': { color: '#111827', backgroundColor: 'transparent' },
                    p: 0,
                    minWidth: 0,
                  }}
                >
                  查看自动化详情 →
                </Button>
              </>
            ) : (
              <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
                未配置自动化任务
              </Typography>
            )}
          </Box>
        </Paper>
      )}

      {/* 技能元信息卡片 */}
      <Paper elevation={0} sx={{ borderRadius: 2, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
        <Box sx={{ px: 2.5, py: 1.5, backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
            元信息
          </Typography>
        </Box>
        <Box sx={{ px: 2.5, py: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <Box>
              <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', mb: 0.25 }}>来源</Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: '#374151' }}>
                {skill.source === 'builtin' ? '内置' : '自定义'}
              </Typography>
            </Box>
            {skill.version && (
              <Box>
                <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', mb: 0.25 }}>版本号</Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: '#374151' }}>v{skill.version}</Typography>
              </Box>
            )}
            {skill.installedAt && (
              <Box>
                <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', mb: 0.25 }}>安装时间</Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: '#374151' }}>
                  {new Date(skill.installedAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </Typography>
              </Box>
            )}
            <Box>
              <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', mb: 0.25 }}>路径</Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: '#374151', fontFamily: 'monospace' }}>
                {skill.path}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default SkillInfoCards;
