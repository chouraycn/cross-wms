/**
 * LocalModelDiscoverDialog — 本地模型自动发现弹窗
 *
 * 扫描局域网 Ollama / vLLM / LM Studio 实例，
 * 展示发现的模型列表，支持一键添加到模型管理。
 */

import React, { useState } from 'react';
import {
  Box, Typography, Dialog, Button, IconButton, Chip, Checkbox,
  CircularProgress, Tooltip, useTheme, TextField,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import StorageIcon from '@mui/icons-material/Storage';
import { providerIcon } from '../../../utils/providerIcons';
import { getModelManagerStyles } from './styles';
import * as api from '../../../services/api';
import type { DiscoveredLocalModel } from '../../../services/api';
import { PROVIDER_ENDPOINTS } from '../../../../shared/data/providerEndpoints';

const OLLAMA_BASE_URL = PROVIDER_ENDPOINTS.ollama.replace(/\/v1$/, '');

interface LocalModelDiscoverDialogProps {
  open: boolean;
  onClose: () => void;
  /** 一键添加选中的模型 */
  onAddModels: (models: DiscoveredLocalModel[]) => void;
  /** 已存在的模型 ID（用于标记已添加） */
  existingModelIds?: string[];
}

const LocalModelDiscoverDialog: React.FC<LocalModelDiscoverDialogProps> = ({
  open,
  onClose,
  onAddModels,
  existingModelIds = [],
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const styles = getModelManagerStyles(isDark);

  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredLocalModel[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState(false);
  const [error, setError] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  // 弹窗打开时自动填充默认地址
  React.useEffect(() => {
    if (!open) return;
    setCustomUrl(OLLAMA_BASE_URL);
  }, [open]);

  // 弹窗关闭时重置状态
  React.useEffect(() => {
    if (!open) {
      setDiscoveredModels([]);
      setSelectedIds(new Set());
      setDiscovered(false);
      setError('');
    }
  }, [open]);

  const handleDiscover = async () => {
    setIsDiscovering(true);
    setError('');
    try {
      // v1.9.3: 通过后端代理发现（传入自定义 Ollama 地址，避免浏览器 CORS 限制）
      const resp = await fetch('/api/models/discover-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ollamaUrl: customUrl }),
      });
      if (!resp.ok) {
        throw new Error(`服务器返回 ${resp.status}`);
      }
      const data = await resp.json();
      const models: DiscoveredLocalModel[] = data.data || [];
      setDiscoveredModels(models);
      setDiscovered(true);
    } catch (e) {
      setError('发现失败：' + ((e as Error)?.message || '未知错误'));
    } finally {
      setIsDiscovering(false);
    }
  };

  const toggleSelect = (model: DiscoveredLocalModel) => {
    const key = `${model.id}@${model.apiEndpoint}`;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const availableModels = discoveredModels.filter(m => !existingModelIds.includes(m.id));
    if (selectedIds.size === availableModels.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(availableModels.map(m => `${m.id}@${m.apiEndpoint}`)));
    }
  };

  const handleAddSelected = () => {
    const selected = discoveredModels.filter(m => selectedIds.has(`${m.id}@${m.apiEndpoint}`));
    if (selected.length > 0) {
      onAddModels(selected);
      setSelectedIds(new Set());
    }
  };

  const availableCount = discoveredModels.filter(m => !existingModelIds.includes(m.id)).length;
  const allSelected = selectedIds.size === availableCount && availableCount > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: '70vh' }}>
        {/* 标题 */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StorageIcon sx={{ fontSize: 20, color: styles.textPrimary }} />
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: styles.textPrimary }}>
              发现本地模型
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} sx={{ color: styles.textMuted }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        <Typography sx={{ fontSize: '0.75rem', color: styles.textMuted }}>
          自动扫描本地 Ollama、vLLM、LM Studio 等推理服务
        </Typography>

        {/* Ollama 地址输入 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: '0.75rem', color: styles.textSecondary, whiteSpace: 'nowrap' }}>
            Ollama 地址：
          </Typography>
          <TextField
            size="small"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder={OLLAMA_BASE_URL}
            sx={{
              flex: 1,
              '& .MuiInputBase-input': {
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                p: '4px 8px',
              },
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: styles.borderLight,
              },
            }}
          />
        </Box>

        {/* 发现按钮 */}
        {!discovered && (
          <Button
            variant="contained"
            startIcon={isDiscovering ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : <SearchIcon />}
            onClick={handleDiscover}
            disabled={isDiscovering}
            sx={{ alignSelf: 'flex-start' }}
          >
            {isDiscovering ? '扫描中...' : '开始扫描'}
          </Button>
        )}

        {/* 错误提示 */}
        {error && (
          <Box sx={{ p: 1, borderRadius: 1.5, backgroundColor: styles.semantic.errorBg, border: `1px solid ${styles.semantic.errorBorder}` }}>
            <Typography sx={{ fontSize: '0.75rem', color: styles.semantic.errorText }}>{error}</Typography>
          </Box>
        )}

        {/* 发现结果 */}
        {discovered && (
          <>
            {/* 结果统计 */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '0.8rem', color: styles.textSecondary }}>
                发现 {discoveredModels.length} 个模型
                {availableCount < discoveredModels.length && `（${discoveredModels.length - availableCount} 个已添加）`}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Button size="small" onClick={toggleSelectAll} sx={{ fontSize: '0.7rem', textTransform: 'none' }}>
                  {allSelected ? '取消全选' : '全选'}
                </Button>
                <Button size="small" onClick={handleDiscover} disabled={isDiscovering} sx={{ fontSize: '0.7rem', textTransform: 'none' }}>
                  重新扫描
                </Button>
              </Box>
            </Box>

            {/* 模型列表 */}
            <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {discoveredModels.length === 0 ? (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '0.8rem', color: styles.textMuted }}>
                    未发现本地模型
                  </Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: styles.textDisabled, mt: 0.5 }}>
                    请确保 Ollama / vLLM / LM Studio 正在运行
                  </Typography>
                </Box>
              ) : (
                discoveredModels.map(model => {
                  const key = `${model.id}@${model.apiEndpoint}`;
                  const alreadyAdded = existingModelIds.includes(model.id);
                  const isSelected = selectedIds.has(key);

                  return (
                    <Box
                      key={key}
                      onClick={() => !alreadyAdded && toggleSelect(model)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        p: 1,
                        borderRadius: 1.5,
                        border: `1px solid ${isSelected ? styles.textSecondary : styles.borderLight}`,
                        backgroundColor: isSelected ? styles.bgActive : alreadyAdded ? styles.bgHover : styles.bgPanel,
                        cursor: alreadyAdded ? 'default' : 'pointer',
                        opacity: alreadyAdded ? 0.6 : 1,
                        '&:hover': alreadyAdded ? {} : { backgroundColor: isSelected ? styles.bgActive : styles.bgHover },
                        transition: 'all 0.15s',
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={alreadyAdded}
                        size="small"
                        sx={{ p: 0.25 }}
                      />
                      {providerIcon(model.provider as import('../../../types/models').ModelProvider, 20)}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: styles.textPrimary, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {model.name}
                          </Typography>
                          {alreadyAdded && (
                            <Chip label="已添加" size="small" sx={{ fontSize: '0.6rem', height: 16, backgroundColor: styles.bgHover, color: styles.textMuted }} />
                          )}
                        </Box>
                        <Typography sx={{ fontSize: '0.7rem', color: styles.textMuted, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {model.id}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                        {model.size && (
                          <Tooltip title="模型大小">
                            <Chip label={model.size} size="small" sx={{ fontSize: '0.6rem', height: 20, backgroundColor: styles.bgHover, color: styles.textMuted }} />
                          </Tooltip>
                        )}
                        {model.parameterSize && (
                          <Tooltip title="参数量">
                            <Chip label={model.parameterSize} size="small" sx={{ fontSize: '0.6rem', height: 20, backgroundColor: styles.bgHover, color: styles.textMuted }} />
                          </Tooltip>
                        )}
                        {model.contextWindow && (
                          <Tooltip title="上下文窗口">
                            <Chip label={`${(model.contextWindow / 1000).toFixed(0)}K ctx`} size="small" sx={{ fontSize: '0.6rem', height: 20, backgroundColor: styles.bgHover, color: styles.textMuted }} />
                          </Tooltip>
                        )}
                      </Box>
                    </Box>
                  );
                })
              )}
            </Box>

            {/* 添加按钮 */}
            {selectedIds.size > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 0.5 }}>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleAddSelected}
                  size="small"
                >
                  添加 {selectedIds.size} 个模型
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>
    </Dialog>
  );
};

export default LocalModelDiscoverDialog;
