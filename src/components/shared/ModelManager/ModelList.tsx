/**
 * ModelList — 三种变体的模型列表渲染
 *
 * - variant="table": 用 <Table> 渲染（类似 AISettingsDialog）
 * - variant="list":  用 <List> 渲染（类似 ModelManagement，带详细描述）
 * - variant="compact": 用 <List> 精简版渲染（类似 SettingsModelManagement）
 */

import React from 'react';
import {
  Box, Typography, Button, Chip, Switch, IconButton, Tooltip, Checkbox,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  List, ListItem, ListItemText,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TuneIcon from '@mui/icons-material/Tune';
import { providerLabel, providerIcon } from '../../../utils/providerIcons';
import { CAPABILITY_LABELS, CAPABILITY_COLORS } from '../../../types/models';
import { switchSx, COLORS } from './styles';
import type { ModelListProps } from './types';

// ===================== Table 变体 =====================

const ModelTable: React.FC<ModelListProps> = ({ models, defaultModelId, actions, selectedModelIds }) => (
  <Box sx={{ flex: 1, overflow: 'auto' }}>
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{
              fontSize: '0.8125rem', fontWeight: 500, color: COLORS.textMuted,
              py: 1.25, px: 1.5, borderBottom: `1px solid ${COLORS.borderLight}`,
              backgroundColor: '#FAFAFA', width: 40,
            }}>
            </TableCell>
            <TableCell sx={{
              fontSize: '0.8125rem', fontWeight: 500, color: COLORS.textMuted,
              py: 1.25, px: 2, borderBottom: `1px solid ${COLORS.borderLight}`,
              backgroundColor: '#FAFAFA',
            }}>
              服务商
            </TableCell>
            <TableCell sx={{
              fontSize: '0.8125rem', fontWeight: 500, color: COLORS.textMuted,
              py: 1.25, px: 2, borderBottom: `1px solid ${COLORS.borderLight}`,
              backgroundColor: '#FAFAFA',
            }}>
              模型
            </TableCell>
            <TableCell align="right" sx={{
              fontSize: '0.8125rem', fontWeight: 500, color: COLORS.textMuted,
              py: 1.25, px: 2, borderBottom: `1px solid ${COLORS.borderLight}`,
              backgroundColor: '#FAFAFA',
            }}>
              操作
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {models.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} align="center" sx={{ py: 8 }}>
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
            models.map(model => (
              <TableRow
                key={model.id}
                sx={{
                  '&:nth-of-type(even)': { backgroundColor: '#FAFAFA' },
                  '&:hover': { backgroundColor: COLORS.bgHover },
                }}
              >
                <TableCell sx={{ py: 1.5, px: 1.5, borderBottom: `1px solid ${COLORS.borderLight}` }}>
                  <Checkbox
                    size="small"
                    checked={selectedModelIds.includes(model.id)}
                    onChange={() => actions.toggleModelSelection(model.id)}
                    sx={{ p: 0.3 }}
                  />
                </TableCell>
                <TableCell sx={{ py: 1.5, px: 2, borderBottom: `1px solid ${COLORS.borderLight}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    {providerIcon(model.provider)}
                    <Typography sx={{ fontSize: '0.8125rem', color: COLORS.textSecondary }}>
                      {providerLabel(model.provider)}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell sx={{ py: 1.5, px: 2, borderBottom: `1px solid ${COLORS.borderLight}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: COLORS.textPrimary }}>
                      {model.name}
                    </Typography>
                    {model.id === defaultModelId && (
                      <Chip label="默认" size="small" sx={{ backgroundColor: COLORS.success, color: '#FFF', fontSize: '0.65rem', height: 18, fontWeight: 600 }} />
                    )}
                    {!model.enabled && (
                      <Chip label="禁用" size="small" sx={{ backgroundColor: COLORS.errorBg, color: COLORS.errorText, fontSize: '0.65rem', height: 18 }} />
                    )}
                    {model.capabilities?.map(cap => (
                      <Chip
                        key={cap}
                        label={CAPABILITY_LABELS[cap]}
                        size="small"
                        sx={{
                          fontSize: '0.6rem',
                          height: 16,
                          backgroundColor: `${CAPABILITY_COLORS[cap]}15`,
                          color: CAPABILITY_COLORS[cap],
                          fontWeight: 500,
                        }}
                      />
                    ))}
                  </Box>
                  {model.description && (
                    <Typography sx={{ fontSize: '0.7rem', color: COLORS.textLight, mt: 0.35 }}>
                      {model.description}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right" sx={{ py: 1.5, px: 2, borderBottom: `1px solid ${COLORS.borderLight}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                    {model.id !== defaultModelId && (
                      <Tooltip title="设为默认">
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => actions.handleSetDefaultModel(model.id)}
                          sx={{ borderColor: COLORS.success, color: COLORS.success, fontSize: '0.7rem', py: 0.15, minWidth: 40, '&:hover': { borderColor: COLORS.successHover } }}
                        >
                          默认
                        </Button>
                      </Tooltip>
                    )}
                    <Switch
                      checked={model.enabled}
                      onChange={e => actions.handleToggleModelEnabled(model.id, e.target.checked)}
                      size="small"
                      sx={switchSx}
                    />
                    <IconButton size="small" onClick={() => actions.openModelDialog('edit', model)} sx={{ color: COLORS.textMuted }}>
                      <EditIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <IconButton size="small" onClick={() => actions.handleDeleteModel(model)} sx={{ color: COLORS.error }}>
                      <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                    </IconButton>
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

const ModelListDetailed: React.FC<ModelListProps> = ({ models, defaultModelId, actions, selectedModelIds }) => (
  <List sx={{ width: '100%', bgcolor: 'background.paper', borderRadius: 1, border: `1px solid ${COLORS.border}` }}>
    {models.map(model => (
      <ListItem
        key={model.id}
        sx={{
          py: 1.5,
          px: 2,
          borderBottom: `1px solid ${COLORS.border}`,
          backgroundColor: model.id === defaultModelId ? COLORS.successBg : 'transparent',
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
              <Checkbox
                size="small"
                checked={selectedModelIds.includes(model.id)}
                onChange={() => actions.toggleModelSelection(model.id)}
                sx={{ p: 0.3, mr: -0.5 }}
              />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: COLORS.textPrimary }}>
                {model.name}
              </Typography>
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
                {model.usageStats && (
                  <Typography sx={{ fontSize: '0.7rem', color: COLORS.textMuted }}>
                    使用 {model.usageStats.callCount} 次
                    {model.usageStats.lastUsedAt ? ` · 最近 ${new Date(model.usageStats.lastUsedAt).toLocaleDateString()}` : ''}
                  </Typography>
                )}
              </Box>
            </Box>
          }
        />
      </ListItem>
    ))}
  </List>
);

// ===================== Compact 变体 =====================

const ModelListCompact: React.FC<ModelListProps> = ({ models, defaultModelId, actions, selectedModelIds }) => (
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
    {models.map(model => (
      <ListItem
        key={model.id}
        sx={{
          py: 1,
          px: 1.5,
          borderBottom: `1px solid ${COLORS.borderLight}`,
          backgroundColor: model.id === defaultModelId ? COLORS.successBg : 'transparent',
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
              <Checkbox
                size="small"
                checked={selectedModelIds.includes(model.id)}
                onChange={() => actions.toggleModelSelection(model.id)}
                sx={{ p: 0.3, mr: -0.5 }}
              />
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: COLORS.textPrimary }}>
                {model.name}
              </Typography>
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
            </Box>
          }
        />
      </ListItem>
    ))}
  </List>
);

// ===================== 导出 =====================

const ModelList: React.FC<ModelListProps> = (props) => {
  switch (props.variant) {
    case 'table':
      return <ModelTable {...props} />;
    case 'compact':
      return <ModelListCompact {...props} />;
    case 'list':
    default:
      return <ModelListDetailed {...props} />;
  }
};

export default ModelList;
