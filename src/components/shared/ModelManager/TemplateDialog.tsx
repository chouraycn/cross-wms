/**
 * TemplateDialog — 配置模板对话框
 *
 * 提供预置的模型配置模板，一键切换工作场景
 */

import React from 'react';
import {
  Dialog, Box, Typography, Button, Grid, Paper, useTheme,
} from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import HomeIcon from '@mui/icons-material/Home';
import SavingsIcon from '@mui/icons-material/Savings';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CodeIcon from '@mui/icons-material/Code';
import { getModelManagerStyles } from './styles';

interface TemplateDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (templateId: string) => void;
}

const TEMPLATES = [
  {
    id: 'domestic',
    name: '国内优先',
    description: '启用腾讯混元、通义千问、DeepSeek 等国内模型',
    icon: <HomeIcon sx={{ fontSize: 28, color: '#EF4444' }} />,
    color: '#EF4444',
  },
  {
    id: 'overseas',
    name: '海外优先',
    description: '启用 OpenAI、Anthropic、Google 等海外模型',
    icon: <PublicIcon sx={{ fontSize: 28, color: '#3B82F6' }} />,
    color: '#3B82F6',
  },
  {
    id: 'cost-effective',
    name: '低成本',
    description: '启用标注为低成本或快速的模型，节省费用',
    icon: <SavingsIcon sx={{ fontSize: 28, color: '#10B981' }} />,
    color: '#10B981',
  },
  {
    id: 'high-performance',
    name: '高性能',
    description: '启用推理能力强或多模态的模型',
    icon: <RocketLaunchIcon sx={{ fontSize: 28, color: '#F59E0B' }} />,
    color: '#F59E0B',
  },
  {
    id: 'coding',
    name: '编程专用',
    description: '仅启用代码专用模型',
    icon: <CodeIcon sx={{ fontSize: 28, color: '#8B5CF6' }} />,
    color: '#8B5CF6',
  },
];

const TemplateDialog: React.FC<TemplateDialogProps> = ({ open, onClose, onApply }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const styles = getModelManagerStyles(isDark);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <Box sx={{ p: 3 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: styles.textPrimary, mb: 0.5 }}>
          应用配置模板
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: styles.textMuted, mb: 2 }}>
          选择预设模板快速切换模型配置，当前配置将被覆盖
        </Typography>

        <Grid container spacing={1.5}>
          {TEMPLATES.map(template => (
            <Grid item xs={12} sm={6} key={template.id}>
              <Paper
                elevation={0}
                onClick={() => onApply(template.id)}
                sx={{
                  p: 2,
                  cursor: 'pointer',
                  border: `1px solid ${styles.border}`,
                  borderRadius: 2,
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: template.color,
                    backgroundColor: `${template.color}08`,
                    transform: 'translateY(-1px)',
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                  {template.icon}
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: styles.textPrimary }}>
                    {template.name}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: '0.75rem', color: styles.textMuted, lineHeight: 1.5 }}>
                  {template.description}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, gap: 1 }}>
          <Button onClick={onClose} sx={{ fontSize: '0.8125rem', textTransform: 'none', color: styles.textMuted }}>
            取消
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default TemplateDialog;
