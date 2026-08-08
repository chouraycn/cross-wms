/**
 * ModelList — 三种变体的模型列表渲染
 *
 * - variant="table": 用 <Table> 渲染（类似 AISettingsDialog）
 * - variant="list":  用 <List> 渲染（类似 ModelManagement，带详细描述）
 * - variant="compact": 用 <List> 精简版渲染（类似 SettingsModelManagement）
 */

import React, { memo } from 'react';
import {
  Box, Typography, Button, Chip, Switch, IconButton, Tooltip, Checkbox,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  List, ListItem, ListItemText, useTheme,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TuneIcon from '@mui/icons-material/Tune';
import { providerLabel, providerIcon } from '../../../utils/providerIcons';
import { CAPABILITY_LABELS, CAPABILITY_COLORS } from '../../../types/models';
import { getModelManagerStyles } from './styles';
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

const ModelTable: React.FC<ModelListProps & { styles: ReturnType<typeof getModelManagerStyles>; isDark: boolean }> = ({
  models, defaultModelId, actions, selectedModelIds, healthStatuses, healthLatencies,
  styles, isDark,
}) => (
  <Box sx={{ flex: 1, overflow: 'auto' }}>
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
        <TableHead>
          <TableRow sx={{ backgroundColor: styles.bgHover }}>
            <TableCell sx={{
              fontSize: '0.75rem', fontWeight: 500, color: styles.textMuted,
              py: 1, px: 1, borderBottom: `1px solid ${styles.borderLight}`,
              backgroundColor: styles.bgHover, width: 36,
            }}>
            </TableCell>
            <TableCell sx={{
              fontSize: '0.75rem', fontWeight: 500, color: styles.textMuted,
              py: 1, px: 1.5, borderBottom: `1px solid ${styles.borderLight}`,
              backgroundColor: styles.bgHover,
            }}>
              模型信息
            </TableCell>
            <TableCell align="right" sx={{
              fontSize: '0.75rem', fontWeight: 500, color: styles.textMuted,
              py: 1, px: 1, borderBottom: `1px solid ${styles.borderLight}`,
              backgroundColor: styles.bgHover, width: 200,
            }}>
              操作
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {models.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} align="center" sx={{ py: 8 }}>
                <Typography sx={{ fontSize: '0.8125rem', color: styles.textDisabled }}>
                  暂无自定义模型，你可以
                  <Box
                    component="span"
                    onClick={() => actions.openModelSelectDialog()}
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
            models.map((model) => (
              <TableRow
                key={model.id}
                sx={{
                  transition: 'background-color 0.15s ease',
                  '&:nth-of-type(even)': { backgroundColor: styles.bgHover },
                  '&:hover': { backgroundColor: styles.bgHover },
                }}
              >
                <TableCell sx={{ py: 1, px: 1, borderBottom: `1px solid ${styles.borderLight}` }}>
                  <Checkbox
                    size="small"
                    checked={selectedModelIds.includes(model.id)}
                    onChange={() => actions.toggleModelSelection(model.id)}
                    sx={{ p: 0.2 }}
                  />
                </TableCell>
                <TableCell sx={{ py: 1, px: 1.5, borderBottom: `1px solid ${styles.borderLight}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                    <HealthDot
                      status={healthStatuses?.[model.id]}
                      latency={healthLatencies?.[model.id]}
                    />
                    {providerIcon(model.provider)}
                    <Typography sx={{ fontSize: '0.75rem', color: styles.textSecondary, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {providerLabel(model.provider)}
                    </Typography>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: styles.textPrimary, ml: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {model.name}
                    </Typography>
                    {model.id === defaultModelId && (
                      <Chip label="默认" size="small" sx={{ backgroundColor: styles.semantic.badgeSuccess, color: '#FFFFFF', fontSize: '0.6rem', height: 16, fontWeight: 600, flexShrink: 0 }} />
                    )}
                    {!model.enabled && (
                      <Chip label="禁用" size="small" sx={{ backgroundColor: styles.semantic.errorBg, color: styles.semantic.errorText, fontSize: '0.6rem', height: 16, flexShrink: 0 }} />
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
                      <Typography sx={{ fontSize: '0.65rem', color: styles.textDisabled, ml: 0.5 }} noWrap>
                        {model.description}
                      </Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell align="right" sx={{ py: 1, px: 1, borderBottom: `1px solid ${styles.borderLight}`, whiteSpace: 'nowrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.25 }}>
                    {model.id !== defaultModelId && (
                      <Tooltip title="设为默认">
                        <Button
                          size="small"
                          variant="contained"
                          color="inherit"
                          onClick={() => actions.handleSetDefaultModel(model.id)}
                          sx={{
                            backgroundColor: `${styles.semantic.success} !important`,
                            color: '#FFFFFF !important',
                            fontSize: '0.7rem',
                            px: 1,
                            py: 0.3,
                            minWidth: 52,
                            height: 28,
                            boxShadow: 'none',
                            whiteSpace: 'nowrap',
                            '&:hover': { backgroundColor: `${styles.semantic.success} !important`, boxShadow: 'none', opacity: 0.9 },
                          }}
                        >
                          默认
                        </Button>
                      </Tooltip>
                    )}
                    <Switch
                      checked={model.enabled}
                      onChange={e => actions.handleToggleModelEnabled(model.id, e.target.checked)}
                      size="small"
                      sx={{ '& .MuiSwitch-root': { width: 36, height: 20 } }}
                    />
                    <Tooltip title="编辑">
                      <IconButton size="small" onClick={() => actions.openModelDialog('edit', model)} sx={{ color: styles.textMuted, p: 0.3 }}>
                        <EditIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除">
                      <IconButton size="small" onClick={() => actions.handleDeleteModel(model)} sx={{ color: styles.semantic.error, p: 0.3 }}>
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

const ModelListDetailed: React.FC<ModelListProps & { styles: ReturnType<typeof getModelManagerStyles>; isDark: boolean }> = ({
  models, defaultModelId, actions, selectedModelIds, healthStatuses, healthLatencies,
  styles, isDark,
}) => (
  <List sx={{ width: '100%', bgcolor: 'background.paper', borderRadius: 1, border: `1px solid ${styles.border}` }}>
    {models.map((model) => (
      <ListItem
        key={model.id}
        sx={{
          py: 1.5,
          px: 2,
          borderBottom: `1px solid ${styles.border}`,
          backgroundColor: model.id === defaultModelId ? styles.semantic.successBg : 'transparent',
          transition: 'background-color 0.15s ease',
          '&:last-child': { borderBottom: 'none' },
        }}
        secondaryAction={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {model.id !== defaultModelId && (
              <Tooltip title="设为默认">
                <Button
                  size="small"
                  variant="contained"
                  color="inherit"
                  onClick={() => actions.handleSetDefaultModel(model.id)}
                  sx={{
                    backgroundColor: `${styles.semantic.success} !important`,
                    color: '#FFFFFF !important',
                    fontSize: '0.75rem',
                    px: 1.5,
                    py: 0.4,
                    minWidth: 60,
                    height: 30,
                    boxShadow: 'none',
                    whiteSpace: 'nowrap',
                    '&:hover': { backgroundColor: `${styles.semantic.success} !important`, boxShadow: 'none', opacity: 0.9 },
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
                sx={{}}
              />
            </Tooltip>
            <Tooltip title="编辑">
              <IconButton size="small" onClick={() => actions.openModelDialog('edit', model)} sx={{ color: styles.textMuted }}>
                <TuneIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="删除">
              <IconButton size="small" onClick={() => actions.handleDeleteModel(model)} sx={{ color: styles.semantic.error }}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        }
      >
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Checkbox
                size="small"
                checked={selectedModelIds.includes(model.id)}
                onChange={() => actions.toggleModelSelection(model.id)}
                sx={{ p: 0.3, mr: -0.5 }}
              />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: styles.textPrimary }}>
                {model.name}
              </Typography>
              <HealthDot
                status={healthStatuses?.[model.id]}
                latency={healthLatencies?.[model.id]}
                size={10}
              />
              {model.id === defaultModelId && (
                <Chip label="默认" size="small" sx={{ backgroundColor: styles.semantic.badgeSuccess, color: '#FFF', fontSize: '0.65rem' }} />
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
                {providerIcon(model.provider, 14)}
                <Typography sx={{ fontSize: '0.7rem', color: styles.textMuted }}>{providerLabel(model.provider)}</Typography>
              </Box>
              {!model.enabled && (
                <Chip label="已禁用" size="small" sx={{ backgroundColor: styles.semantic.errorBg, color: styles.semantic.errorText, fontSize: '0.65rem' }} />
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
              <Typography sx={{ fontSize: '0.75rem', color: styles.textMuted }}>
                ID: {model.id}
              </Typography>
              {model.description && (
                <Typography sx={{ fontSize: '0.75rem', color: styles.textDisabled, mt: 0.5 }}>
                  {model.description}
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap' }}>
                {model.contextWindow != null && (
                  <Typography sx={{ fontSize: '0.7rem', color: styles.textDisabled }}>
                    上下文：{model.contextWindow.toLocaleString()} tokens
                  </Typography>
                )}
                {model.maxTokens != null && (
                  <Typography sx={{ fontSize: '0.7rem', color: styles.textDisabled }}>
                    最大输出：{model.maxTokens.toLocaleString()} tokens
                  </Typography>
                )}
                {model.temperature != null && (
                  <Typography sx={{ fontSize: '0.7rem', color: styles.textDisabled }}>
                    温度：{model.temperature}
                  </Typography>
                )}
                {model.topP != null && (
                  <Typography sx={{ fontSize: '0.7rem', color: styles.textDisabled }}>
                    Top P：{model.topP}
                  </Typography>
                )}
                <Typography sx={{ fontSize: '0.7rem', color: styles.textMuted }}>
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

const ModelListCompact: React.FC<ModelListProps & { styles: ReturnType<typeof getModelManagerStyles>; isDark: boolean }> = ({
  models, defaultModelId, actions, selectedModelIds, healthStatuses, healthLatencies,
  styles, isDark,
}) => (
  <List sx={{ width: '100%', bgcolor: 'background.paper', borderRadius: 1, border: `1px solid ${styles.border}`, p: 0 }}>
    {models.length === 0 && (
      <ListItem>
        <ListItemText
          primary={
            <Typography sx={{ fontSize: '0.8rem', color: styles.textDisabled, textAlign: 'center' }}>
              暂无模型配置
            </Typography>
          }
        />
      </ListItem>
    )}
    {models.map((model) => (
      <ListItem
        key={model.id}
        sx={{
          py: 1,
          px: 1.5,
          borderBottom: `1px solid ${styles.borderLight}`,
          backgroundColor: model.id === defaultModelId ? styles.semantic.successBg : 'transparent',
          transition: 'background-color 0.15s ease',
          '&:last-child': { borderBottom: 'none' },
        }}
        secondaryAction={
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            {model.id !== defaultModelId && (
              <Tooltip title="设为默认">
                <Button
                  size="small"
                  variant="contained"
                  color="inherit"
                  onClick={() => actions.handleSetDefaultModel(model.id)}
                  sx={{
                    backgroundColor: `${styles.semantic.success} !important`,
                    color: '#FFFFFF !important',
                    fontSize: '0.7rem',
                    px: 1.5,
                    py: 0.4,
                    minWidth: 60,
                    height: 30,
                    boxShadow: 'none',
                    whiteSpace: 'nowrap',
                    '&:hover': { backgroundColor: `${styles.semantic.success} !important`, boxShadow: 'none', opacity: 0.9 },
                  }}
                >
                  默认
                </Button>
              </Tooltip>
            )}
            <Switch
              checked={model.enabled}
              onChange={e => actions.handleToggleModelEnabled(model.id, e.target.checked)}
              size="small"
              sx={{ '& .MuiSwitch-switchBase': { py: 0 } }}
            />
            <IconButton size="small" onClick={() => actions.openModelDialog('edit', model)} sx={{ color: styles.textMuted }}>
              <EditIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <IconButton size="small" onClick={() => actions.handleDeleteModel(model)} sx={{ color: styles.semantic.error }}>
              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        }
      >
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              <Checkbox
                size="small"
                checked={selectedModelIds.includes(model.id)}
                onChange={() => actions.toggleModelSelection(model.id)}
                sx={{ p: 0.3, mr: -0.5 }}
              />
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: styles.textPrimary }}>
                {model.name}
              </Typography>
              <HealthDot
                status={healthStatuses?.[model.id]}
                latency={healthLatencies?.[model.id]}
                size={7}
              />
              {model.id === defaultModelId && (
                <Chip label="默认" size="small" sx={{ backgroundColor: styles.semantic.badgeSuccess, color: '#FFF', fontSize: '0.6rem', height: 18 }} />
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
                {providerIcon(model.provider, 14)}
                <Typography sx={{ fontSize: '0.7rem', color: styles.textMuted }}>{providerLabel(model.provider)}</Typography>
              </Box>
              {!model.enabled && (
                <Chip label="禁用" size="small" sx={{ backgroundColor: styles.semantic.errorBg, color: styles.semantic.errorText, fontSize: '0.6rem', height: 18 }} />
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
              <Typography sx={{ fontSize: '0.7rem', color: styles.textDisabled }}>
                {model.description || model.id}
                {model.contextWindow ? ` · ${model.contextWindow.toLocaleString()} ctx` : ''}
                {model.maxTokens ? ` · ${model.maxTokens.toLocaleString()} out` : ''}
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: styles.textMuted, mt: 0.25 }}>
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
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const styles = getModelManagerStyles(isDark);

  // 搜索和能力标签筛选（过滤掉 hidden 模型）
  const filteredModels = React.useMemo(() => {
    let result = props.models.filter(m => !m.hidden);
    // 按搜索关键词过滤
    if (props.searchQuery) {
      const q = props.searchQuery.toLowerCase();
      result = result.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q)
      );
    }
    // 按能力标签过滤
    if (props.selectedCapabilities && props.selectedCapabilities.length > 0) {
      result = result.filter(m =>
        props.selectedCapabilities!.some(cap => m.capabilities?.includes(cap as any))
      );
    }
    return result;
  }, [props.models, props.searchQuery, props.selectedCapabilities]);

  const filteredProps = { ...props, models: filteredModels };

  switch (props.variant) {
    case 'table':
      return <ModelTable {...filteredProps} styles={styles} isDark={isDark} />;
    case 'compact':
      return <ModelListCompact {...filteredProps} styles={styles} isDark={isDark} />;
    case 'list':
    default:
      return <ModelListDetailed {...filteredProps} styles={styles} isDark={isDark} />;
  }
};

export default memo(ModelList);
