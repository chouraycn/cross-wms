/**
 * ModelToolbar — 操作工具栏（精简版）
 *
 * 布局策略：
 * - 主要操作：添加模型（始终可见）
 * - 次要操作：收起为 "更多" 下拉菜单（恢复默认、导出、导入、模板、发现本地）
 * - 状态操作：健康检测、自动刷新开关
 */

import React, { useState } from 'react';
import {
  Box, Typography, Button, Chip, Tooltip, IconButton, Menu, MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import StorageIcon from '@mui/icons-material/Storage';
import TimerIcon from '@mui/icons-material/Timer';
import TimerOffIcon from '@mui/icons-material/TimerOff';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { COLORS, toolbarButtonSx } from './styles';
import type { ModelToolbarProps } from './types';
import { SpinningIcon } from '../SpinningIcon';

const ModelToolbar: React.FC<ModelToolbarProps> = ({
  variant,
  defaultModelId,
  models,
  onAdd,
  onReset,
  onExport,
  onImport,
  onTemplate,
  onHealthCheck,
  isHealthChecking,
  onDiscoverLocal,
  autoRefreshEnabled,
  onToggleAutoRefresh,
  healthCheckError,
}) => {
  const defaultModel = models.find(m => m.id === defaultModelId);
  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null);

  // ========== table 变体：精简单行布局 ==========
  if (variant === 'table') {
    return (
      <Box sx={{ mb: 2 }}>
        {/* 标题区 */}
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: COLORS.textPrimary, mb: 0.5 }}>
            模型
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: '0.8125rem', color: COLORS.textMuted }}>
              配置 API key 添加更多可用模型
            </Typography>
            <Chip
              label={`默认: ${defaultModel?.name || '未设置'}`}
              size="small"
              sx={{
                backgroundColor: defaultModel ? COLORS.successBg : COLORS.errorBg,
                color: defaultModel ? COLORS.success : COLORS.errorText,
                fontSize: '0.7rem',
                height: 20,
                fontWeight: 500,
              }}
            />
          </Box>
        </Box>

        {/* 错误提示 */}
        {healthCheckError && (
          <Box sx={{ mb: 2, p: 1.5, backgroundColor: COLORS.errorBg, borderRadius: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <ErrorOutlineIcon sx={{ color: COLORS.error, fontSize: 18 }} />
            <Typography sx={{ fontSize: '0.8rem', color: COLORS.errorText }}>
              {healthCheckError}
            </Typography>
          </Box>
        )}

        {/* 操作栏：单行紧凑布局 */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          {/* 左侧：主要操作 + 更多菜单 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon sx={{ fontSize: 16 }} />}
              onClick={onAdd}
              sx={toolbarButtonSx}
            >
              添加模型
            </Button>

            {/* 更多操作下拉 */}
            <Tooltip title="更多操作">
              <IconButton
                size="small"
                onClick={e => setMoreAnchor(e.currentTarget)}
                sx={{ color: COLORS.textMuted, border: `1px solid ${COLORS.border}`, borderRadius: 1 }}
              >
                <MoreVertIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={moreAnchor}
              open={Boolean(moreAnchor)}
              onClose={() => setMoreAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              PaperProps={{ sx: { minWidth: 160, borderRadius: 1.5 } }}
            >
              <MenuItem onClick={() => { onReset(); setMoreAnchor(null); }} sx={{ fontSize: '0.8125rem', gap: 1 }}>
                <RestartAltIcon sx={{ fontSize: 16, color: COLORS.textMuted }} />
                恢复默认配置
              </MenuItem>
              <MenuItem onClick={() => { onExport(); setMoreAnchor(null); }} sx={{ fontSize: '0.8125rem', gap: 1 }}>
                <FileDownloadIcon sx={{ fontSize: 16, color: COLORS.textMuted }} />
                导出 JSON
              </MenuItem>
              <MenuItem onClick={() => { onImport(); setMoreAnchor(null); }} sx={{ fontSize: '0.8125rem', gap: 1 }}>
                <FileUploadIcon sx={{ fontSize: 16, color: COLORS.textMuted }} />
                导入 JSON
              </MenuItem>
              <MenuItem onClick={() => { onTemplate(); setMoreAnchor(null); }} sx={{ fontSize: '0.8125rem', gap: 1 }}>
                <DashboardCustomizeIcon sx={{ fontSize: 16, color: COLORS.textMuted }} />
                应用模板
              </MenuItem>
              {onDiscoverLocal && (
                <MenuItem onClick={() => { onDiscoverLocal(); setMoreAnchor(null); }} sx={{ fontSize: '0.8125rem', gap: 1 }}>
                  <StorageIcon sx={{ fontSize: 16, color: COLORS.textMuted }} />
                  发现本地模型
                </MenuItem>
              )}
            </Menu>
          </Box>

          {/* 右侧：健康检测 + 自动刷新 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {onHealthCheck && (
              <Tooltip title="检测所有模型 API 连接状态">
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={isHealthChecking
                    ? <SpinningIcon spinning={isHealthChecking}><AutorenewIcon sx={{ fontSize: 14 }} /></SpinningIcon>
                    : <MonitorHeartIcon sx={{ fontSize: 14 }} />
                  }
                  onClick={onHealthCheck}
                  disabled={isHealthChecking}
                  sx={{
                    borderColor: '#D1D5DB',
                    color: COLORS.textMuted,
                    fontSize: '0.75rem',
                    py: 0.3,
                    '&:hover': { borderColor: '#9CA3AF' },
                  }}
                >
                  {isHealthChecking ? '检测中' : '健康检测'}
                </Button>
              </Tooltip>
            )}
            {onToggleAutoRefresh && (
              <Tooltip title={autoRefreshEnabled ? '自动刷新已开启（5分钟）' : '自动刷新已关闭'}>
                <IconButton
                  size="small"
                  onClick={onToggleAutoRefresh}
                  sx={{
                    color: autoRefreshEnabled ? '#10B981' : COLORS.textMuted,
                    border: `1px solid ${autoRefreshEnabled ? '#10B981' : COLORS.border}`,
                    borderRadius: 1,
                    p: 0.6,
                  }}
                >
                  {autoRefreshEnabled
                    ? <TimerIcon sx={{ fontSize: 16 }} />
                    : <TimerOffIcon sx={{ fontSize: 16 }} />
                  }
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
      </Box>
    );
  }

  // ========== compact 变体：极简风格 ==========
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
          {onHealthCheck && (
            <Tooltip title={isHealthChecking ? '检测中...' : '健康检测'}>
              <IconButton size="small" onClick={onHealthCheck} disabled={isHealthChecking} sx={{ color: COLORS.textMuted, p: 0.5 }}>
                {isHealthChecking
                  ? <SpinningIcon spinning={isHealthChecking}><AutorenewIcon sx={{ fontSize: 16 }} /></SpinningIcon>
                  : <MonitorHeartIcon sx={{ fontSize: 16 }} />
                }
              </IconButton>
            </Tooltip>
          )}
          {onDiscoverLocal && (
            <Tooltip title="发现本地模型">
              <IconButton size="small" onClick={onDiscoverLocal} sx={{ color: COLORS.textMuted, p: 0.5 }}>
                <StorageIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          {onToggleAutoRefresh && (
            <Tooltip title={autoRefreshEnabled ? '自动刷新已开启（5分钟）' : '自动刷新已关闭'}>
              <IconButton
                size="small"
                onClick={onToggleAutoRefresh}
                sx={{ color: autoRefreshEnabled ? '#10B981' : COLORS.textMuted, p: 0.5 }}
              >
                {autoRefreshEnabled ? <TimerIcon sx={{ fontSize: 16 }} /> : <TimerOffIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </Tooltip>
          )}
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={onAdd}
            sx={{ ...toolbarButtonSx, fontSize: '0.7rem', py: 0.3 }}
          >
            添加
          </Button>
        </Box>
      </Box>
    );
  }

  // ========== list 变体：默认详细风格 ==========
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
      {healthCheckError && (
        <Box sx={{ p: 1.5, backgroundColor: COLORS.errorBg, borderRadius: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ErrorOutlineIcon sx={{ color: COLORS.error, fontSize: 18 }} />
          <Typography sx={{ fontSize: '0.8rem', color: COLORS.errorText }}>
            {healthCheckError}
          </Typography>
        </Box>
      )}
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
            sx={toolbarButtonSx}
          >
            添加模型
          </Button>
          <Tooltip title="恢复默认模型配置">
            <IconButton size="small" onClick={onReset} sx={{ color: COLORS.textMuted }}>
              <RestartAltIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="导出模型配置">
            <IconButton size="small" onClick={onExport} sx={{ color: COLORS.textMuted }}>
              <FileDownloadIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="导入模型配置">
            <IconButton size="small" onClick={onImport} sx={{ color: COLORS.textMuted }}>
              <FileUploadIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="应用配置模板">
            <IconButton size="small" onClick={onTemplate} sx={{ color: COLORS.textMuted }}>
              <DashboardCustomizeIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          {onHealthCheck && (
            <Tooltip title="检测所有模型 API 连接状态">
              <IconButton
                size="small"
                onClick={onHealthCheck}
                disabled={isHealthChecking}
                sx={{ color: COLORS.textMuted }}
              >
                {isHealthChecking
                  ? <SpinningIcon spinning={isHealthChecking}><AutorenewIcon sx={{ fontSize: 18 }} /></SpinningIcon>
                  : <MonitorHeartIcon sx={{ fontSize: 18 }} />
                }
              </IconButton>
            </Tooltip>
          )}
          {onDiscoverLocal && (
            <Tooltip title="自动发现本地 Ollama/vLLM 模型">
              <IconButton size="small" onClick={onDiscoverLocal} sx={{ color: COLORS.textMuted }}>
                <StorageIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
          {onToggleAutoRefresh && (
            <Tooltip title={autoRefreshEnabled ? '自动刷新已开启（5分钟）' : '自动刷新已关闭'}>
              <IconButton
                size="small"
                onClick={onToggleAutoRefresh}
                sx={{ color: autoRefreshEnabled ? '#10B981' : COLORS.textMuted }}
              >
                {autoRefreshEnabled ? <TimerIcon sx={{ fontSize: 18 }} /> : <TimerOffIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
      <Typography sx={{ fontSize: '0.8rem', color: COLORS.textMuted }}>
        管理AI模型配置，设置默认模型。当前默认模型：
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
