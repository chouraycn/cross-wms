/**
 * MatchConfigPanel — 匹配引擎设置面板
 *
 * 功能：
 * - 匹配模式选择（语义/关键词/混合）
 * - 权重配置（语义/关键词/上下文 滑块）
 * - 置信度阈值（自动激活/候选展示 滑块）
 * - 开关：云端增强、上下文感知、模糊匹配
 * - 模型状态显示
 * - 嵌入缓存状态（已索引技能数）
 * - 保存/重置按钮
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Slider,
  Switch,
  FormControlLabel,
  Button,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Paper,
  CircularProgress,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import SaveIcon from '@mui/icons-material/Save';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import StorageIcon from '@mui/icons-material/Storage';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import PsychologyIcon from '@mui/icons-material/Psychology';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import {
  getMatchConfig,
  updateMatchConfig,
  resetMatchConfig,
  getEmbeddingStatus,
  generateEmbeddings,
  DEFAULT_MATCH_ENGINE_CONFIG,
  loadLocalMatchConfig,
  type MatchEngineConfig,
} from '../../services/matchingApi';
import { useToast } from '../../contexts/ToastContext';

// ===================== 类型 =====================

export interface MatchConfigPanelProps {
  /** 嵌入后是否回调（可选） */
  onConfigSaved?: () => void;
}

// ===================== 组件 =====================

const MatchConfigPanel: React.FC<MatchConfigPanelProps> = ({ onConfigSaved }) => {
  const { showToast } = useToast();
  const [config, setConfig] = useState<MatchEngineConfig>({ ...DEFAULT_MATCH_ENGINE_CONFIG });
  const [embeddingStatus, setEmbeddingStatus] = useState<{ total: number; embedded: number; modelInfo: { name: string; dimension: number; ready: boolean } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // 加载配置
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [remoteConfig, status] = await Promise.all([
        getMatchConfig(),
        getEmbeddingStatus().catch(() => null),
      ]);
      // 合并 localStorage 中的前端扩展字段
      const localConfig = loadLocalMatchConfig();
      setConfig({ ...remoteConfig, ...localConfig });
      setEmbeddingStatus(status);
    } catch (err) {
      // console.error('[MatchConfigPanel] loadConfig failed:', err);
      const localConfig = loadLocalMatchConfig();
      setConfig({ ...DEFAULT_MATCH_ENGINE_CONFIG, ...localConfig });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // 配置变更检测
  useEffect(() => {
    const localConfig = loadLocalMatchConfig();
    const merged = { ...DEFAULT_MATCH_ENGINE_CONFIG, ...localConfig };
    const changed = JSON.stringify(config) !== JSON.stringify(merged);
    setHasChanges(changed);
  }, [config]);

  /** 保存配置 */
  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMatchConfig(config);
      showToast('匹配引擎配置已保存', 'success');
      setHasChanges(false);
      onConfigSaved?.();
    } catch (err) {
      showToast('保存配置失败：' + (err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  /** 重置配置 */
  const handleReset = async () => {
    try {
      await resetMatchConfig();
      setConfig({ ...DEFAULT_MATCH_ENGINE_CONFIG });
      showToast('配置已重置为默认值', 'info');
      setHasChanges(false);
    } catch (err) {
      showToast('重置配置失败：' + (err as Error).message, 'error');
    }
  };

  /** 重建嵌入 */
  const handleRebuildEmbeddings = async () => {
    setRebuilding(true);
    try {
      const result = await generateEmbeddings();
      showToast(`嵌入向量重建完成：生成 ${result.generated}，跳过 ${result.skipped}`, 'success');
      // 刷新状态
      const status = await getEmbeddingStatus().catch(() => null);
      setEmbeddingStatus(status);
    } catch (err) {
      showToast('重建嵌入失败：' + (err as Error).message, 'error');
    } finally {
      setRebuilding(false);
    }
  };

  /** 更新配置字段的通用方法 */
  const updateField = <K extends keyof MatchEngineConfig>(key: K, value: MatchEngineConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 560 }}>
      {/* 标题 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <TuneIcon sx={{ fontSize: 20, color: '#7C3AED' }} />
        <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
          匹配引擎设置
        </Typography>
      </Box>

      {/* ===== 匹配模式 ===== */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: '8px', border: '1px solid #E5E7EB' }}>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', mb: 1.5 }}>
          匹配模式
        </Typography>
        <FormControl fullWidth size="small">
          <InputLabel sx={{ fontSize: '0.75rem' }}>匹配模式</InputLabel>
          <Select
            value={config.semanticWeight >= 0.8 ? 'semantic' : config.keywordWeight >= 0.8 ? 'keyword' : 'hybrid'}
            label="匹配模式"
            onChange={(e) => {
              const mode = e.target.value;
              if (mode === 'semantic') {
                updateField('semanticWeight', 0.9);
                updateField('keywordWeight', 0.1);
              } else if (mode === 'keyword') {
                updateField('semanticWeight', 0.1);
                updateField('keywordWeight', 0.9);
              } else {
                updateField('semanticWeight', 0.6);
                updateField('keywordWeight', 0.4);
              }
            }}
            sx={{ fontSize: '0.8125rem' }}
          >
            <MenuItem value="semantic" sx={{ fontSize: '0.8125rem' }}>
              语义匹配 — 基于嵌入向量的语义理解
            </MenuItem>
            <MenuItem value="keyword" sx={{ fontSize: '0.8125rem' }}>
              关键词匹配 — 基于文本匹配的快速检索
            </MenuItem>
            <MenuItem value="hybrid" sx={{ fontSize: '0.8125rem' }}>
              混合模式 — 语义 + 关键词加权融合
            </MenuItem>
          </Select>
        </FormControl>
      </Paper>

      {/* ===== 权重配置 ===== */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: '8px', border: '1px solid #E5E7EB' }}>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', mb: 1.5 }}>
          权重配置
        </Typography>

        {/* 语义权重 */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>语义权重</Typography>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#7C3AED' }}>
              {Math.round(config.semanticWeight * 100)}%
            </Typography>
          </Box>
          <Slider
            value={config.semanticWeight}
            min={0}
            max={1}
            step={0.05}
            onChange={(_, v) => {
              const sv = v as number;
              updateField('semanticWeight', sv);
              updateField('keywordWeight', Math.round((1 - sv) * 100) / 100);
            }}
            sx={{ color: '#7C3AED' }}
          />
        </Box>

        {/* 关键词权重 */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>关键词权重</Typography>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#2563EB' }}>
              {Math.round(config.keywordWeight * 100)}%
            </Typography>
          </Box>
          <Slider
            value={config.keywordWeight}
            min={0}
            max={1}
            step={0.05}
            onChange={(_, v) => {
              const kv = v as number;
              updateField('keywordWeight', kv);
              updateField('semanticWeight', Math.round((1 - kv) * 100) / 100);
            }}
            sx={{ color: '#2563EB' }}
          />
        </Box>

        {/* 上下文窗口 */}
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>上下文窗口</Typography>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#6B7280' }}>
              {config.contextWindowSize} 条
            </Typography>
          </Box>
          <Slider
            value={config.contextWindowSize}
            min={1}
            max={20}
            step={1}
            onChange={(_, v) => updateField('contextWindowSize', v as number)}
            sx={{ color: '#6B7280' }}
          />
        </Box>
      </Paper>

      {/* ===== 置信度阈值 ===== */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: '8px', border: '1px solid #E5E7EB' }}>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', mb: 1.5 }}>
          置信度阈值
        </Typography>

        {/* 自动激活阈值 */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
              自动激活阈值
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#059669' }}>
              {Math.round(config.autoActivateThreshold * 100)}%
            </Typography>
          </Box>
          <Slider
            value={config.autoActivateThreshold}
            min={0.3}
            max={1}
            step={0.05}
            onChange={(_, v) => updateField('autoActivateThreshold', v as number)}
            sx={{ color: '#059669' }}
          />
          <Typography sx={{ fontSize: '0.625rem', color: '#9CA3AF' }}>
            匹配置信度 ≥ 此值时自动激活技能
          </Typography>
        </Box>

        {/* 候选展示阈值 */}
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
              候选展示阈值
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#D97706' }}>
              {Math.round(config.candidateThreshold * 100)}%
            </Typography>
          </Box>
          <Slider
            value={config.candidateThreshold}
            min={0.1}
            max={0.9}
            step={0.05}
            onChange={(_, v) => updateField('candidateThreshold', v as number)}
            sx={{ color: '#D97706' }}
          />
          <Typography sx={{ fontSize: '0.625rem', color: '#9CA3AF' }}>
            匹配置信度 ≥ 此值时展示候选列表供用户选择
          </Typography>
        </Box>
      </Paper>

      {/* ===== 开关设置 ===== */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: '8px', border: '1px solid #E5E7EB' }}>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', mb: 1.5 }}>
          高级设置
        </Typography>

        <FormControlLabel
          control={
            <Switch
              checked={config.cloudEnhanced}
              onChange={(e) => updateField('cloudEnhanced', e.target.checked)}
              size="small"
              sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#7C3AED' } }}
            />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CloudQueueIcon sx={{ fontSize: 14, color: '#6B7280' }} />
              <Typography sx={{ fontSize: '0.8125rem', color: '#374151' }}>云端增强</Typography>
            </Box>
          }
          sx={{ mb: 0.5 }}
        />
        <Typography sx={{ fontSize: '0.625rem', color: '#9CA3AF', ml: 5, mb: 1 }}>
          启用云端模型增强匹配精度（需要网络连接）
        </Typography>

        <FormControlLabel
          control={
            <Switch
              checked={config.contextAware}
              onChange={(e) => updateField('contextAware', e.target.checked)}
              size="small"
              sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#7C3AED' } }}
            />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PsychologyIcon sx={{ fontSize: 14, color: '#6B7280' }} />
              <Typography sx={{ fontSize: '0.8125rem', color: '#374151' }}>上下文感知</Typography>
            </Box>
          }
          sx={{ mb: 0.5 }}
        />
        <Typography sx={{ fontSize: '0.625rem', color: '#9CA3AF', ml: 5, mb: 1 }}>
          利用对话历史上下文提升匹配准确率
        </Typography>

        <FormControlLabel
          control={
            <Switch
              checked={config.fuzzyMatch}
              onChange={(e) => updateField('fuzzyMatch', e.target.checked)}
              size="small"
              sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#7C3AED' } }}
            />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AutoFixHighIcon sx={{ fontSize: 14, color: '#6B7280' }} />
              <Typography sx={{ fontSize: '0.8125rem', color: '#374151' }}>模糊匹配</Typography>
            </Box>
          }
          sx={{ mb: 0.5 }}
        />
        <Typography sx={{ fontSize: '0.625rem', color: '#9CA3AF', ml: 5 }}>
          允许拼写偏差和近义词匹配
        </Typography>
      </Paper>

      {/* ===== 模型 & 嵌入状态 ===== */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: '8px', border: '1px solid #E5E7EB' }}>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', mb: 1.5 }}>
          模型 & 嵌入状态
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          {embeddingStatus?.modelInfo.ready ? (
            <CheckCircleOutlineIcon sx={{ fontSize: 16, color: '#059669' }} />
          ) : (
            <ErrorOutlineIcon sx={{ fontSize: 16, color: '#D97706' }} />
          )}
          <Typography sx={{ fontSize: '0.75rem', color: '#374151' }}>
            嵌入模型：{embeddingStatus?.modelInfo.name || 'N/A'}
          </Typography>
          <Chip
            label={`${embeddingStatus?.modelInfo.dimension || 0} 维`}
            size="small"
            sx={{ height: 20, fontSize: '0.625rem' }}
          />
          <Chip
            label={embeddingStatus?.modelInfo.ready ? '就绪' : '未就绪'}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.625rem',
              bgcolor: embeddingStatus?.modelInfo.ready ? '#DCFCE7' : '#FEF3C7',
              color: embeddingStatus?.modelInfo.ready ? '#059669' : '#D97706',
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <StorageIcon sx={{ fontSize: 16, color: '#6B7280' }} />
          <Typography sx={{ fontSize: '0.75rem', color: '#374151' }}>
            已索引技能：{embeddingStatus?.embedded ?? 0} / {embeddingStatus?.total ?? 0}
          </Typography>
        </Box>

        <Button
          size="small"
          variant="outlined"
          onClick={handleRebuildEmbeddings}
          disabled={rebuilding}
          startIcon={rebuilding ? <CircularProgress size={12} /> : <AutoFixHighIcon sx={{ fontSize: 14 }} />}
          sx={{
            fontSize: '0.75rem',
            textTransform: 'none',
            borderColor: '#E5E7EB',
            color: '#6B7280',
            '&:hover': { borderColor: '#7C3AED', color: '#7C3AED' },
          }}
        >
          {rebuilding ? '重建中...' : '重建嵌入索引'}
        </Button>
      </Paper>

      <Divider sx={{ my: 2 }} />

      {/* ===== 保存 / 重置 ===== */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<RestartAltIcon sx={{ fontSize: 14 }} />}
          onClick={handleReset}
          sx={{
            fontSize: '0.8125rem',
            textTransform: 'none',
            borderColor: '#E5E7EB',
            color: '#6B7280',
            '&:hover': { borderColor: '#DC2626', color: '#DC2626' },
          }}
        >
          重置
        </Button>
        <Button
          size="small"
          variant="contained"
          startIcon={saving ? <CircularProgress size={12} sx={{ color: '#fff' }} /> : <SaveIcon sx={{ fontSize: 14 }} />}
          onClick={handleSave}
          disabled={saving || !hasChanges}
          sx={{
            fontSize: '0.8125rem',
            textTransform: 'none',
            bgcolor: '#7C3AED',
            '&:hover': { bgcolor: '#6D28D9' },
            '&.Mui-disabled': { bgcolor: '#E5E7EB', color: '#9CA3AF' },
          }}
        >
          {saving ? '保存中...' : '保存'}
        </Button>
      </Box>
    </Box>
  );
};

export default MatchConfigPanel;
