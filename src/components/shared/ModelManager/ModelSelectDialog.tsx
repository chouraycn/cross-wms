/**
 * ModelSelectDialog — 分步添加模型 Step 1：选择模型
 *
 * 用户从 24+ 提供商的预设模型列表中选择一个模型，
 * 选中后自动填充提供商、模型 ID、名称、端点、能力标签等基础信息，
 * 然后进入 Step 2 补全 API Key 等信息。
 */

import React, { useState, useMemo } from 'react';
import {
  Box, Typography, TextField, Dialog, Chip, InputAdornment, IconButton, Button,
  Collapse, List, ListItemButton, ListItemText, ListItemIcon, Divider, useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { providerLabel, providerIcon, ALL_PROVIDERS } from '../../../utils/providerIcons';
import { CAPABILITY_LABELS, CAPABILITY_COLORS, type ModelCapability } from '../../../types/models';
import { getModelManagerStyles } from './styles';
import type { ModelProvider } from '../../../types/models';
import presetModelsData from '../../../../shared/data/preset-models.json';

/** 预设模型模板 — 选择后自动填充所有基础信息 */
export interface PresetModel {
  id: string;
  name: string;
  provider: ModelProvider;
  description: string;
  contextWindow: number;
  maxTokens: number;
  capabilities: ModelCapability[];
}

/** 按提供商分组的预设模型列表 — 从 JSON 文件动态加载 */
const PRESET_MODELS: PresetModel[] = (presetModelsData as { version: string; models: PresetModel[] }).models;

export { PRESET_MODELS };

interface ModelSelectDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (preset: PresetModel) => void;
  /** 已存在的模型 ID（用于标记已添加） */
  existingModelIds?: string[];
}

const ModelSelectDialog: React.FC<ModelSelectDialogProps> = ({
  open,
  onClose,
  onSelect,
  existingModelIds = [],
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const styles = getModelManagerStyles(isDark);

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  // 按提供商分组
  const groupedModels = useMemo(() => {
    const groups: Record<string, PresetModel[]> = {};
    for (const model of PRESET_MODELS) {
      if (!groups[model.provider]) groups[model.provider] = [];
      groups[model.provider].push(model);
    }
    return groups;
  }, []);

  // 搜索过滤
  const filteredProviders = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return ALL_PROVIDERS.filter(p => groupedModels[p]?.length > 0);
    return ALL_PROVIDERS.filter(p => {
      const models = groupedModels[p] || [];
      return models.some(
        m =>
          m.id.toLowerCase().includes(query) ||
          m.name.toLowerCase().includes(query) ||
          m.description.toLowerCase().includes(query) ||
          providerLabel(p).toLowerCase().includes(query)
      );
    });
  }, [searchQuery, groupedModels]);

  const toggleProvider = (provider: string) => {
    setExpandedProviders(prev => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  const handleSelect = (preset: PresetModel) => {
    onSelect(preset);
    // 重置搜索状态
    setSearchQuery('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, maxHeight: '80vh' } }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
        {/* 标题栏 */}
        <Box sx={{ px: 2.5, pt: 2, pb: 1 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: styles.textPrimary }}>
            选择模型
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: styles.textMuted, mt: 0.25 }}>
            从预设列表中选择模型，或自定义输入
          </Typography>
        </Box>

        {/* 搜索框 */}
        <Box sx={{ px: 2.5, pb: 1 }}>
          <TextField
            placeholder="搜索模型名称、ID 或提供商..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            size="small"
            fullWidth
            autoFocus
            sx={styles.input}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: styles.textMuted }} />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        <Divider />

        {/* 模型列表 */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 1 }}>
          {filteredProviders.map(provider => {
            const models = groupedModels[provider] || [];
            const isExpanded = expandedProviders.has(provider) || searchQuery.length > 0;
            const filteredModels = searchQuery
              ? models.filter(
                  m =>
                    m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    m.description.toLowerCase().includes(searchQuery.toLowerCase())
                )
              : models;

            if (filteredModels.length === 0) return null;

            return (
              <Box key={provider} sx={{ mb: 0.5 }}>
                {/* 提供商标题（可折叠） */}
                <ListItemButton
                  onClick={() => !searchQuery && toggleProvider(provider)}
                  sx={{
                    borderRadius: 1.5,
                    py: 0.75,
                    '&:hover': { backgroundColor: styles.border },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {providerIcon(provider, 20)}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: styles.textPrimary }}>
                        {providerLabel(provider)}
                      </Typography>
                    }
                    secondary={
                      <Typography sx={{ fontSize: '0.7rem', color: styles.textMuted }}>
                        {filteredModels.length} 个模型
                      </Typography>
                    }
                  />
                  {!searchQuery && (
                    isExpanded
                      ? <ExpandLessIcon sx={{ fontSize: 18, color: styles.textMuted }} />
                      : <ExpandMoreIcon sx={{ fontSize: 18, color: styles.textMuted }} />
                  )}
                </ListItemButton>

                {/* 模型列表 */}
                <Collapse in={isExpanded}>
                  <List dense sx={{ py: 0, pl: 1 }}>
                    {filteredModels.map(model => {
                      const alreadyAdded = existingModelIds.includes(model.id);
                      return (
                        <ListItemButton
                          key={`${provider}-${model.id}`}
                          onClick={() => !alreadyAdded && handleSelect(model)}
                          disabled={alreadyAdded}
                          sx={{
                            borderRadius: 1.5,
                            py: 0.75,
                            pl: 3,
                            opacity: alreadyAdded ? 0.5 : 1,
                            '&:hover': alreadyAdded ? {} : { backgroundColor: styles.bgActive },
                          }}
                        >
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography sx={{
                                  fontSize: '0.8125rem',
                                  fontWeight: 500,
                                  color: alreadyAdded ? styles.textMuted : styles.textPrimary,
                                  fontFamily: 'monospace',
                                }}>
                                  {model.name}
                                </Typography>
                                {alreadyAdded && (
                                  <Chip
                                    label="已添加"
                                    size="small"
                                    sx={{
                                      fontSize: '0.625rem',
                                      height: 18,
                                      backgroundColor: styles.bgHover,
                                      color: styles.textMuted,
                                    }}
                                  />
                                )}
                              </Box>
                            }
                            secondary={
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, mt: 0.25 }}>
                                <Typography sx={{ fontSize: '0.7rem', color: styles.textMuted }}>
                                  {model.description}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                  {model.capabilities.map(cap => (
                                    <Chip
                                      key={cap}
                                      label={CAPABILITY_LABELS[cap]}
                                      size="small"
                                      sx={{
                                        fontSize: '0.625rem',
                                        height: 18,
                                        backgroundColor: `${CAPABILITY_COLORS[cap]}15`,
                                        color: CAPABILITY_COLORS[cap],
                                        border: `1px solid ${CAPABILITY_COLORS[cap]}30`,
                                      }}
                                    />
                                  ))}
                                </Box>
                              </Box>
                            }
                          />
                          {!alreadyAdded && (
                            <ChevronRightIcon sx={{ fontSize: 16, color: styles.textDisabled }} />
                          )}
                        </ListItemButton>
                      );
                    })}
                  </List>
                </Collapse>
              </Box>
            );
          })}
        </Box>

        {/* 底部操作 */}
        <Divider />
        <Box sx={{ px: 2.5, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button
            size="small"
            onClick={() => {
              // 选择"自定义" — 传递空 preset 让 Step 2 进入手动模式
              onSelect({
                id: '',
                name: '',
                provider: 'custom',
                description: '',
                contextWindow: 32000,
                maxTokens: 4096,
                capabilities: ['general'],
              });
            }}
            sx={{
              fontSize: '0.8rem',
              textTransform: 'none',
              color: styles.textMuted,
              '&:hover': { backgroundColor: 'transparent', textDecoration: 'underline' },
            }}
          >
            自定义模型（手动填写）
          </Button>
          <Button
            variant="outlined"
            onClick={onClose}
            size="small"
            sx={{ fontSize: '0.8rem', borderColor: styles.borderDarker, color: styles.textSecondary }}
          >
            取消
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default ModelSelectDialog;
