/**
 * ModelToolbar — 操作工具栏
 *
 * 包含：
 * - 添加模型按钮
 * - 恢复默认按钮（F5）
 * - 导出按钮（F6）
 * - 导入按钮（F6）
 */

import React from 'react';
import {
  Box, Typography, Button, Chip, Tooltip, IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import { COLORS, toolbarButtonSx, primaryButtonSx } from './styles';
import type { ModelToolbarProps } from './types';

const ModelToolbar: React.FC<ModelToolbarProps> = ({
  variant,
  defaultModelId,
  models,
  onAdd,
  onReset,
  onExport,
  onImport,
  onTemplate,
}) => {
  const defaultModel = models.find(m => m.id === defaultModelId);

  // table 变体：类似 AISettingsDialog 风格
  if (variant === 'table') {
    return (
      <Box sx={{ mb: 2 }}>
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: COLORS.textPrimary, mb: 0.5 }}>
            模型
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: COLORS.textPrimary, mb: 0.75 }}>
            模型管理
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: COLORS.textMuted, mb: 2.5, lineHeight: 1.6 }}>
            配置 API key 添加更多可用模型，预留模型默认使用稳定版本。
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon sx={{ fontSize: 16 }} />}
            onClick={onAdd}
            sx={toolbarButtonSx}
          >
            添加模型
          </Button>
          <Tooltip title="恢复默认模型配置">
            <Button
              variant="outlined"
              size="small"
              startIcon={<RestartAltIcon sx={{ fontSize: 16 }} />}
              onClick={onReset}
              sx={{ borderColor: '#D1D5DB', color: COLORS.textMuted, fontSize: '0.8125rem', '&:hover': { borderColor: '#9CA3AF' } }}
            >
              恢复默认
            </Button>
          </Tooltip>
          <Tooltip title="导出模型配置为 JSON">
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownloadIcon sx={{ fontSize: 16 }} />}
              onClick={onExport}
              sx={{ borderColor: '#D1D5DB', color: COLORS.textMuted, fontSize: '0.8125rem', '&:hover': { borderColor: '#9CA3AF' } }}
            >
              导出
            </Button>
          </Tooltip>
          <Tooltip title="从 JSON 文件导入模型配置">
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileUploadIcon sx={{ fontSize: 16 }} />}
              onClick={onImport}
              sx={{ borderColor: '#D1D5DB', color: COLORS.textMuted, fontSize: '0.8125rem', '&:hover': { borderColor: '#9CA3AF' } }}
            >
              导入
            </Button>
          </Tooltip>
          <Tooltip title="应用配置模板">
            <Button
              variant="outlined"
              size="small"
              startIcon={<DashboardCustomizeIcon sx={{ fontSize: 16 }} />}
              onClick={onTemplate}
              sx={{ borderColor: '#D1D5DB', color: COLORS.textMuted, fontSize: '0.8125rem', '&:hover': { borderColor: '#9CA3AF' } }}
            >
              模板
            </Button>
          </Tooltip>
        </Box>
      </Box>
    );
  }

  // compact 变体：极简风格
  if (variant === 'compact') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography sx={{ fontSize: '0.8rem', color: COLORS.textMuted }}>
          默认模型：
          <Chip
            label={defaultModel?.name || '未设置'}
            size="small"
            sx={{ ml: 0.5, backgroundColor: COLORS.infoBg, color: COLORS.infoText, fontSize: '0.7rem', height: 22 }}
          />
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="恢复默认">
            <IconButton size="small" onClick={onReset} sx={{ color: COLORS.textMuted, p: 0.5 }}>
              <RestartAltIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="导出">
            <IconButton size="small" onClick={onExport} sx={{ color: COLORS.textMuted, p: 0.5 }}>
              <FileDownloadIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="导入">
            <IconButton size="small" onClick={onImport} sx={{ color: COLORS.textMuted, p: 0.5 }}>
              <FileUploadIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="模板">
            <IconButton size="small" onClick={onTemplate} sx={{ color: COLORS.textMuted, p: 0.5 }}>
              <DashboardCustomizeIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={onAdd}
            sx={{ ...primaryButtonSx, fontSize: '0.7rem', py: 0.3 }}
          >
            添加
          </Button>
        </Box>
      </Box>
    );
  }

  // list 变体：默认详细风格
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: COLORS.textPrimary }}>
          模型管理
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={onAdd}
            sx={primaryButtonSx}
          >
            添加模型
          </Button>
          <Tooltip title="恢复默认模型配置">
            <Button
              variant="outlined"
              size="small"
              startIcon={<RestartAltIcon sx={{ fontSize: 16 }} />}
              onClick={onReset}
              sx={{ borderColor: '#D1D5DB', color: COLORS.textMuted, fontSize: '0.8rem', '&:hover': { borderColor: '#9CA3AF' } }}
            >
              恢复默认
            </Button>
          </Tooltip>
          <Tooltip title="导出模型配置">
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownloadIcon sx={{ fontSize: 16 }} />}
              onClick={onExport}
              sx={{ borderColor: '#D1D5DB', color: COLORS.textMuted, fontSize: '0.8rem', '&:hover': { borderColor: '#9CA3AF' } }}
            >
              导出
            </Button>
          </Tooltip>
          <Tooltip title="导入模型配置">
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileUploadIcon sx={{ fontSize: 16 }} />}
              onClick={onImport}
              sx={{ borderColor: '#D1D5DB', color: COLORS.textMuted, fontSize: '0.8rem', '&:hover': { borderColor: '#9CA3AF' } }}
            >
              导入
            </Button>
          </Tooltip>
          <Tooltip title="应用配置模板">
            <Button
              variant="outlined"
              size="small"
              startIcon={<DashboardCustomizeIcon sx={{ fontSize: 16 }} />}
              onClick={onTemplate}
              sx={{ borderColor: '#D1D5DB', color: COLORS.textMuted, fontSize: '0.8rem', '&:hover': { borderColor: '#9CA3AF' } }}
            >
              模板
            </Button>
          </Tooltip>
        </Box>
      </Box>
      <Typography sx={{ fontSize: '0.8rem', color: COLORS.textMuted }}>
        管理 AI 模型配置，设置默认模型。当前默认模型：
        <Chip
          label={defaultModel?.name || '未设置'}
          size="small"
          sx={{ ml: 1, backgroundColor: COLORS.infoBg, color: COLORS.infoText, fontSize: '0.75rem' }}
        />
      </Typography>
    </Box>
  );
};

export default ModelToolbar;
