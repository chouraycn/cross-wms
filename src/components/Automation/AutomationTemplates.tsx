/**
 * AutomationTemplates — 任务模板 Tab
 *
 * 纯展示组件，接收模板快速创建回调
 */

import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
} from '@mui/material';
import CodeIcon from '@mui/icons-material/Code';
import RepeatIcon from '@mui/icons-material/Repeat';

import { AUTOMATION_TEMPLATES } from '../../services/automation';
import type { AutomationTemplate } from '../../services/automation';
import {
  TASK_TYPE_LABELS,
  TASK_TYPE_COLORS,
  TEMPLATE_ICON_MAP,
} from './sharedConstants';

// ===================== Props =====================

export interface AutomationTemplatesProps {
  onQuickCreate: (tpl: AutomationTemplate) => void;
}

// ===================== Component =====================

const AutomationTemplates: React.FC<AutomationTemplatesProps> = ({
  onQuickCreate,
}) => {

  return (
    <Box>
      <Typography sx={{ fontSize: '0.8125rem', color: '#6B7280', mb: 2.5 }}>
        选择模板快速创建自动化任务，点击即可生成
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 2 }}>
        {AUTOMATION_TEMPLATES.map((tpl: AutomationTemplate) => {
          const tplColor = TASK_TYPE_COLORS[tpl.taskType];
          const tplIcon = TEMPLATE_ICON_MAP[tpl.icon] || <CodeIcon sx={{ fontSize: 20 }} />;
          return (
            <Card
              key={tpl.id}
              elevation={0}
              sx={{
                border: '1px solid #E5E7EB',
                borderRadius: 2,
                transition: 'all 0.15s ease',
                cursor: 'pointer',
                '&:hover': {
                  borderColor: tplColor,
                  boxShadow: `0 4px 12px ${tplColor}18`,
                  transform: 'translateY(-1px)',
                },
              }}
              onClick={() => onQuickCreate(tpl)}
            >
              <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                {/* 头部：图标 + 名称 */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 2,
                      backgroundColor: `${tplColor}12`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: tplColor,
                    }}
                  >
                    {tplIcon}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                      {tpl.name}
                    </Typography>
                    <Chip
                      label={TASK_TYPE_LABELS[tpl.taskType]}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.625rem',
                        fontWeight: 500,
                        backgroundColor: `${tplColor}12`,
                        color: tplColor,
                        mt: 0.25,
                      }}
                    />
                  </Box>
                </Box>
                {/* 描述 */}
                <Typography sx={{ fontSize: '0.75rem', color: '#6B7280', lineHeight: 1.5, mb: 1.5 }}>
                  {tpl.description}
                </Typography>
                {/* 默认调度 */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, pt: 1.5, borderTop: '1px solid #F3F4F6' }}>
                  <RepeatIcon sx={{ fontSize: 14, color: '#9CA3AF' }} />
                  <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                    默认：{tpl.defaultSchedule.scheduleType === 'recurring'
                      ? `${tpl.defaultSchedule.freq === 'HOURLY' ? '每小时' : tpl.defaultSchedule.freq === 'DAILY' ? '每天' : tpl.defaultSchedule.freq === 'WEEKLY' ? '每周' : '每月'}${tpl.defaultSchedule.freq !== 'HOURLY' ? ` ${String(tpl.defaultSchedule.hour).padStart(2, '0')}:${String(tpl.defaultSchedule.minute).padStart(2, '0')}` : ''}`
                      : '一次性'}
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  <Typography sx={{ fontSize: '0.7rem', color: tplColor, fontWeight: 500 }}>
                    点击创建 →
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {/* 自定义模板提示 */}
      <Box sx={{ mt: 3, p: 2, backgroundColor: '#F9FAFB', borderRadius: 2, border: '1px dashed #E5E7EB' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CodeIcon sx={{ fontSize: 16, color: '#9CA3AF' }} />
          <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
            需要更多自定义？切换到「已配置」Tab 点击「新建自动化」从头创建
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default AutomationTemplates;
