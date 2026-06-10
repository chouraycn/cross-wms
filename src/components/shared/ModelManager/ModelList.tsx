/**
 * ModelList — 三种变体的模型列表渲染
 *
 * - variant="table": 用 <Table> 渲染（类似 AISettingsDialog）
 * - variant="list":  用 <List> 渲染（类似 ModelManagement，带详细描述）
 * - variant="compact": 用 <List> 精简版渲染（类似 SettingsModelManagement）
 */

import React, { useState } from 'react';
import {
  Box, Typography, Button, Chip, Switch, IconButton, Tooltip, Checkbox,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  List, ListItem, ListItemText,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TuneIcon from '@mui/icons-material/Tune';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { providerLabel, providerIcon } from '../../../utils/providerIcons';
import { CAPABILITY_LABELS, CAPABILITY_COLORS } from '../../../types/models';
import { switchSx, COLORS } from './styles';
import type { ModelListProps } from './types';

// ===================== 时间格式化工具 =====================

function formatTimeAgo(isoString: string | null): string {
  if (!isoString) return '从未使用';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 30) return `${diffDays}天前`;
  return date.toLocaleDateString('zh-CN');
}

function formatUsageStats(stats?: { callCount: number; lastUsedAt: string | null }): string {
  if (!stats || stats.callCount === 0) return '从未使用';
  return `${stats.callCount} 次 · ${formatTimeAgo(stats.lastUsedAt)}`;
}

// ===================== 健康状态指示灯 =====================

const HEALTH_COLORS: Record<string, string> = {
  healthy: '#10B981',
  unhealthy: '#EF4444',
  timeout: '#F59E0B',
  skipped: '#D1D5DB',
  unknown: '#E5E7EB',
};

const HEALTH_LABELS: Record<string, string> = {
  healthy: '正常',
  unhealthy: '异常',
  timeout: '超时',
  skipped: '未检测',
  unknown: '未检测',
};

interface HealthDotProps {
  status?: string;
  latency?: number;
  size?: number;
}

const HealthDot: React.FC<HealthDotProps> = ({ status = 'unknown', latency, size = 8 }) => {
  const color = HEALTH_COLORS[status] || HEALTH_COLORS.unknown;
  const label = HEALTH_LABELS[status] || HEALTH_LABELS.unknown;
  const latencyText = latency != null ? ` · ${latency}ms` : '';

  return (
    <Tooltip title={`${label}${latencyText}`}>
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: color,
          display: 'inline-block',
          flexShrink: 0,
          boxShadow: status === 'healthy' ? `0 0 4px ${color}40` : 'none',
          transition: 'background-color 0.3s',
        }}
      />
    </Tooltip>
  );
};

// ===================== Table 变体 =====================

interface DragProps {
  isFiltered: boolean;
  draggingIndex: number | null;
  dragOverIndex: number | null;
  handleDragStart: (index: number) => (e: React.DragEvent) => void;
  handleDragOver: (index: number) => (e: React.DragEvent) => void;
  handleDragLeave: () => void;
  handleDrop: (index: number) => (e: React.DragEvent) => void;
  handleDragEnd: () => void;
}

const ModelTable: React.FC<ModelListProps & DragProps> = ({
  models, defaultModelId, actions, selectedModelIds, healthStatuses, healthLatencies,
  isFiltered, draggingIndex, dragOverIndex, handleDragStart, handleDragOver, handleDragLeave, handleDrop, handleDragEnd,
}) => (
  <Box sx={{ flex: 1, overflow: 'auto' }}>
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {!isFiltered && (
              <TableCell sx={{
                fontSize: '0.75rem', fontWeight: 500, color: COLORS.textMuted,
                py: 1, px: 1, borderBottom: `1px solid ${COLORS.borderLight}`,
                backgroundColor: '#FAFAFA', width: 28,
              }}>
              </TableCell>
            )}
            <TableCell sx={{
              fontSize: '0.75rem', fontWeight: 500, color: COLORS.textMuted,
              py: 1, px: 1, borderBottom: `1px solid ${COLORS.borderLight}`,
              backgroundColor: '#FAFAFA', width: 36,
            }}>
            </TableCell>
            <TableCell sx={{
              fontSize: '0.75rem', fontWeight: 500, color: COLORS.textMuted,
              py: 1, px: 1.5, borderBottom: `1px solid ${COLORS.borderLight}`,
              backgroundColor: '#FAFAFA',
            }}>
              模型信息
            </TableCell>
            <TableCell align="right" sx={{
              fontSize: '0.75rem', fontWeight: 500, color: COLORS.textMuted,
              py: 1, px: 1.5, borderBottom: `1px solid ${COLORS.borderLight}`,
              backgroundColor: '#FAFAFA', width: 140,
            }}>
              操作
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {models.length === 0 ? (
            <TableRow>
              <TableCell colSpan={isFiltered ? 3 : 4} align="center" sx={{ py: 8 }}>
                <Typography sx={{ fontSize: '0.8125rem', color: COLORS.textLight }}>
                  暂无自定义模型，你可以
                  <Box
                    component="span"
                    onClick={() => actions.openModelDialog('add')}
                    sx={{
                      cursor: 'pointer',
                      color: '#2563EB',
                      textDecoration: 'underline',
                      textDecorationColor: '#93C5FD',
                      '&:hover': { color: '#1D4ED8' },
                    }}
                  >
                    添加自定义模型
                  </Box>
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            models.map((model, index) => (
              <TableRow
                key={model.id}
                draggable={!isFiltered}
                onDragStart={handleDragStart(index)}
                onDragOver={handleDragOver(index)}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop(index)}
                onDragEnd={handleDragEnd}
                sx={{
                  opacity: draggingIndex === index ? 0.5 : 1,
                  backgroundColor: dragOverIndex === index ? 'rgba(25, 118, 210, 0.08)' : 'inherit',
                  transition: 'background-color 0.15s ease',
                  cursor: isFiltered ? 'default' : 'move',
                  '&:nth-of-type(even)': { backgroundColor: dragOverIndex === index ? 'rgba(25, 118, 210, 0.08)' : '#FAFAFA' },
                  '&:hover': { backgroundColor: dragOverIndex === index ? 'rgba(25, 118, 210, 0.08)' : COLORS.bgHover },
                }}
              >
                {!isFiltered && (
                  <TableCell padding="checkbox" sx={{ width: 28, cursor: 'grab', borderBottom: `1px solid ${COLORS.borderLight}`, py: 1 }}>
                    <DragIndicatorIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                  </TableCell>
                )}
                <TableCell sx={{ py: 1, px: 1, borderBottom: `1px solid ${COLORS.borderLight}` }}>
                  <Checkbox
                    size="small"
                    checked={selectedModelIds.includes(model.id)}
                    onChange={() => actions.toggleModelSelection(model.id)}
                    sx={{ p: 0.2 }}
                  />
                </TableCell>
                <TableCell sx={{ py: 1, px: 1.5, borderBottom: `1px solid ${COLORS.borderLight}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <HealthDot
                      status={healthStatuses?.[model.id]}
                      latency={healthLatencies?.[model.id]}
                    />
                    {providerIcon(model.provider)}
                    <Typography sx={{ fontSize: '0.75rem', color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
                      {providerLabel(model.provider)}
                    </Typography>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: COLORS.textPrimary, ml: 0.5 }}>
                      {model.name}
                    </Typography>
                    {model.id === defaultModelId && (
                      <Chip label="默认" size="small" sx={{ backgroundColor: COLORS.success, color: '#FFF', fontSize: '0.6rem', height: 16, fontWeight: 600 }} />
                    )}
                    {!model.enabled && (
                      <Chip label="禁用" size="small" sx={{ backgroundColor: COLORS.errorBg, color: COLORS.errorText, fontSize: '0.6rem', height: 16 }} />
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
                    {model.capabilities?.slice(0, 4).map(cap => (
                      <Chip
                        key={cap}
                        label={CAPABILITY_LABELS[cap]}
                        size="small"
                        sx={{
                          fontSize: '0.55rem',
                          height: 14,
                          backgroundColor: `${CAPABILITY_COLORS[cap]}12`,
                          color: CAPABILITY_COLORS[cap],
                          fontWeight: 500,
                        }}
                      />
                    ))}
                    {model.description && (
                      <Typography sx={{ fontSize: '0.65rem', color: COLORS.textLight, ml: 0.5 }} noWrap>
                        {model.description}
                      </Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell align="right" sx={{ py: 1, px: 1.5, borderBottom: `1px solid ${COLORS.borderLight}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                    {model.id !== defaultModelId && (
                      <Tooltip title="设为默认">
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => actions.handleSetDefaultModel(model.id)}
                          sx={{ borderColor: COLORS.success, color: COLORS.success, fontSize: '0.65rem', py: 0.1, minWidth: 36, height: 24, '&:hover': { borderColor: COLORS.successHover } }}
                        >
                          默认
                        </Button>
                      </Tooltip>
                    )}
                    <Switch
                      checked={model.enabled}
                      onChange={e => actions.handleToggleModelEnabled(model.id, e.target.checked)}
                      size="small"
                      sx={{ ...switchSx, '& .MuiSwitch-root': { width: 36, height: 20 } }}
                    />
                    <Tooltip title="编辑">
                      <IconButton size="small" onClick={() => actions.openModelDialog('edit', model)} sx={{ color: COLORS.textMuted, p: 0.4 }}>
                        <EditIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除">
                      <IconButton size="small" onClick={() => actions.handleDeleteModel(model)} sx={{ color: COLORS.error, p: 0.4 }}>
                        <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  </Box>
);

// ===================== List 变体（详细版） =====================

const ModelListDetailed: React.FC<ModelListProps & DragProps> = ({
  models, defaultModelId, actions, selectedModelIds, healthStatuses, healthLatencies,
  isFiltered, draggingIndex, dragOverIndex, handleDragStart, handleDragOver, handleDragLeave, handleDrop, handleDragEnd,
}) => (
  <List sx={{ width: '100%', bgcolor: 'background.paper', borderRadius: 1, border: `1px solid ${COLORS.border}` }}>
    {models.map((model, index) => (
      <ListItem
        key={model.id}
        draggable={!isFiltered}
        onDragStart={handleDragStart(index)}
        onDragOver={handleDragOver(index)}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop(index)}
        onDragEnd={handleDragEnd}
        sx={{
          py: 1.5,
          px: 2,
          borderBottom: `1px solid ${COLORS.border}`,
          backgroundColor: dragOverIndex === index ? 'rgba(25, 118, 210, 0.08)' : (model.id === defaultModelId ? COLORS.successBg : 'transparent'),
          opacity: draggingIndex === index ? 0.5 : 1,
          transition: 'background-color 0.15s ease',
          cursor: isFiltered ? 'default' : 'move',
          '&:last-child': { borderBottom: 'none' },
        }}
        secondaryAction={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {model.id !== defaultModelId && (
              <Tooltip title="设为默认">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => actions.handleSetDefaultModel(model.id)}
                  sx={{
                    borderColor: COLORS.success,
                    color: COLORS.success,
                    fontSize: '0.7rem',
                    py: 0.2,
                    '&:hover': { borderColor: COLORS.successHover, backgroundColor: COLORS.successBg },
                  }}
                >
                  默认
                </Button>
              </Tooltip>
            )}
            <Tooltip title={model.enabled ? '禁用' : '启用'}>
              <Switch
                checked={model.enabled}
                onChange={e => actions.handleToggleModelEnabled(model.id, e.target.checked)}
                size="small"
                sx={switchSx}
              />
            </Tooltip>
            <Tooltip title="编辑">
              <IconButton size="small" onClick={() => actions.openModelDialog('edit', model)} sx={{ color: COLORS.textMuted }}>
                <TuneIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="删除">
              <IconButton size="small" onClick={() => actions.handleDeleteModel(model)} sx={{ color: COLORS.error }}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        }
      >
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {!isFiltered && (
                <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'grab' }}>
                  <DragIndicatorIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                </Box>
              )}
              <Checkbox
                size="small"
                checked={selectedModelIds.includes(model.id)}
                onChange={() => actions.toggleModelSelection(model.id)}
                sx={{ p: 0.3, mr: -0.5 }}
              />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: COLORS.textPrimary }}>
                {model.name}
              </Typography>
              <HealthDot
                status={healthStatuses?.[model.id]}
                latency={healthLatencies?.[model.id]}
                size={10}
              />
              {model.id === defaultModelId && (
                <Chip label="默认" size="small" sx={{ backgroundColor: COLORS.success, color: '#FFF', fontSize: '0.65rem' }} />
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
                {providerIcon(model.provider, 14)}
                <Typography sx={{ fontSize: '0.7rem', color: COLORS.textMuted }}>{providerLabel(model.provider)}</Typography>
              </Box>
              {!model.enabled && (
                <Chip label="已禁用" size="small" sx={{ backgroundColor: COLORS.errorBg, color: COLORS.errorText, fontSize: '0.65rem' }} />
              )}
              {model.capabilities?.map(cap => (
                <Chip
                  key={cap}
                  label={CAPABILITY_LABELS[cap]}
                  size="small"
                  sx={{
                    fontSize: '0.6rem',
                    height: 18,
                    backgroundColor: `${CAPABILITY_COLORS[cap]}15`,
                    color: CAPABILITY_COLORS[cap],
                    fontWeight: 500,
                  }}
                />
              ))}
            </Box>
          }
          secondary={
            <Box sx={{ mt: 0.5, ml: 3.5 }}>
              <Typography sx={{ fontSize: '0.75rem', color: COLORS.textMuted }}>
                ID: {model.id}
              </Typography>
              {model.description && (
                <Typography sx={{ fontSize: '0.75rem', color: COLORS.textLight, mt: 0.5 }}>
                  {model.description}
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap' }}>
                {model.contextWindow != null && (
                  <Typography sx={{ fontSize: '0.7rem', color: COLORS.textLight }}>
                    上下文：{model.contextWindow.toLocaleString()} tokens
                  </Typography>
                )}
                {model.maxTokens != null && (
                  <Typography sx={{ fontSize: '0.7rem', color: COLORS.textLight }}>
                    最大输出：{model.maxTokens.toLocaleString()} tokens
                  </Typography>
                )}
                {model.temperature != null && (
                  <Typography sx={{ fontSize: '0.7rem', color: COLORS.textLight }}>
                    温度：{model.temperature}
                  </Typography>
                )}
                {model.topP != null && (
                  <Typography sx={{ fontSize: '0.7rem', color: COLORS.textLight }}>
                    Top P：{model.topP}
                  </Typography>
                )}
                <Typography sx={{ fontSize: '0.7rem', color: COLORS.textMuted }}>
                  {formatUsageStats(model.usageStats)}
                </Typography>
              </Box>
            </Box>
          }
        />
      </ListItem>
    ))}
  </List>
);

// ===================== Compact 变体 =====================

const ModelListCompact: React.FC<ModelListProps & DragProps> = ({
  models, defaultModelId, actions, selectedModelIds, healthStatuses, healthLatencies,
  isFiltered, draggingIndex, dragOverIndex, handleDragStart, handleDragOver, handleDragLeave, handleDrop, handleDragEnd,
}) => (
  <List sx={{ width: '100%', bgcolor: 'background.paper', borderRadius: 1, border: `1px solid ${COLORS.border}`, p: 0 }}>
    {models.length === 0 && (
      <ListItem>
        <ListItemText
          primary={
            <Typography sx={{ fontSize: '0.8rem', color: COLORS.textLight, textAlign: 'center' }}>
              暂无模型配置
            </Typography>
          }
        />
      </ListItem>
    )}
    {models.map((model, index) => (
      <ListItem
        key={model.id}
        draggable={!isFiltered}
        onDragStart={handleDragStart(index)}
        onDragOver={handleDragOver(index)}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop(index)}
        onDragEnd={handleDragEnd}
        sx={{
          py: 1,
          px: 1.5,
          borderBottom: `1px solid ${COLORS.borderLight}`,
          backgroundColor: dragOverIndex === index ? 'rgba(25, 118, 210, 0.08)' : (model.id === defaultModelId ? COLORS.successBg : 'transparent'),
          opacity: draggingIndex === index ? 0.5 : 1,
          transition: 'background-color 0.15s ease',
          cursor: isFiltered ? 'default' : 'move',
          '&:last-child': { borderBottom: 'none' },
        }}
        secondaryAction={
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            {model.id !== defaultModelId && (
              <Tooltip title="设为默认">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => actions.handleSetDefaultModel(model.id)}
                  sx={{ borderColor: COLORS.success, color: COLORS.success, fontSize: '0.6rem', py: 0.1, minWidth: 32, '&:hover': { borderColor: COLORS.successHover } }}
                >
                  默认
                </Button>
              </Tooltip>
            )}
            <Switch
              checked={model.enabled}
              onChange={e => actions.handleToggleModelEnabled(model.id, e.target.checked)}
              size="small"
              sx={{ ...switchSx, '& .MuiSwitch-switchBase': { py: 0 } }}
            />
            <IconButton size="small" onClick={() => actions.openModelDialog('edit', model)} sx={{ color: COLORS.textMuted }}>
              <EditIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <IconButton size="small" onClick={() => actions.handleDeleteModel(model)} sx={{ color: COLORS.error }}>
              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        }
      >
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              {!isFiltered && (
                <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'grab' }}>
                  <DragIndicatorIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                </Box>
              )}
              <Checkbox
                size="small"
                checked={selectedModelIds.includes(model.id)}
                onChange={() => actions.toggleModelSelection(model.id)}
                sx={{ p: 0.3, mr: -0.5 }}
              />
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: COLORS.textPrimary }}>
                {model.name}
              </Typography>
              <HealthDot
                status={healthStatuses?.[model.id]}
                latency={healthLatencies?.[model.id]}
                size={7}
              />
              {model.id === defaultModelId && (
                <Chip label="默认" size="small" sx={{ backgroundColor: COLORS.success, color: '#FFF', fontSize: '0.6rem', height: 18 }} />
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
                {providerIcon(model.provider, 14)}
                <Typography sx={{ fontSize: '0.7rem', color: COLORS.textMuted }}>{providerLabel(model.provider)}</Typography>
              </Box>
              {!model.enabled && (
                <Chip label="禁用" size="small" sx={{ backgroundColor: COLORS.errorBg, color: COLORS.errorText, fontSize: '0.6rem', height: 18 }} />
              )}
              {model.capabilities?.slice(0, 2).map(cap => (
                <Chip
                  key={cap}
                  label={CAPABILITY_LABELS[cap]}
                  size="small"
                  sx={{
                    fontSize: '0.55rem',
                    height: 14,
                    backgroundColor: `${CAPABILITY_COLORS[cap]}15`,
                    color: CAPABILITY_COLORS[cap],
                    fontWeight: 500,
                  }}
                />
              ))}
            </Box>
          }
          secondary={
            <Box sx={{ ml: 3 }}>
              <Typography sx={{ fontSize: '0.7rem', color: COLORS.textLight }}>
                {model.description || model.id}
                {model.contextWindow ? ` · ${model.contextWindow.toLocaleString()} ctx` : ''}
                {model.maxTokens ? ` · ${model.maxTokens.toLocaleString()} out` : ''}
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: COLORS.textMuted, mt: 0.25 }}>
                {formatUsageStats(model.usageStats)}
              </Typography>
            </Box>
          }
        />
      </ListItem>
    ))}
  </List>
);

// ===================== 导出 =====================

const ModelList: React.FC<ModelListProps> = (props) => {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const isFiltered = !!(props.searchQuery || (props.selectedCapabilities && props.selectedCapabilities.length > 0));

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    setDraggingIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggingIndex !== null && draggingIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (draggingIndex !== null && draggingIndex !== index) {
      props.actions.reorderModels(draggingIndex, index);
    }
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  // 搜索和能力标签筛选，同时保留原始索引
  const filteredModelsWithIndex = React.useMemo(() => {
    let result = props.models.map((m, idx) => ({ model: m, originalIndex: idx }));
    // 按搜索关键词过滤
    if (props.searchQuery) {
      const q = props.searchQuery.toLowerCase();
      result = result.filter(({ model: m }) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q)
      );
    }
    // 按能力标签过滤
    if (props.selectedCapabilities && props.selectedCapabilities.length > 0) {
      result = result.filter(({ model: m }) =>
        props.selectedCapabilities!.some(cap => m.capabilities?.includes(cap as any))
      );
    }
    return result;
  }, [props.models, props.searchQuery, props.selectedCapabilities]);

  const dragProps = {
    isFiltered,
    draggingIndex,
    dragOverIndex,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  };

  const filteredProps = { ...props, models: filteredModelsWithIndex.map(({ model }) => model) };

  switch (props.variant) {
    case 'table':
      return <ModelTable {...filteredProps} {...dragProps} />;
    case 'compact':
      return <ModelListCompact {...filteredProps} {...dragProps} />;
    case 'list':
    default:
      return <ModelListDetailed {...filteredProps} {...dragProps} />;
  }
};

export default ModelList;
