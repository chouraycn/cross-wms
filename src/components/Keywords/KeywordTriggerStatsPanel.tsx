/**
 * KeywordTriggerStatsPanel — 关键词触发统计面板
 *
 * 功能：
 * - 显示总触发次数、匹配尝试次数、成功率
 * - 显示 Top 10 热门技能和关键词
 * - 显示最近触发记录
 * - 支持重置统计
 * - 支持配置阈值、匹配模式等
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Divider,
  CircularProgress,
  Slider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Paper,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import HistoryIcon from '@mui/icons-material/History';
import {
  getKeywordTriggerStats,
  resetKeywordTriggerStats,
  updateKeywordTriggerConfig,
  refreshKeywordTriggerRules,
  type KeywordTriggerStats as Stats,
} from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

interface KeywordTriggerStatsPanelProps {
  onClose?: () => void;
}

const KeywordTriggerStatsPanel: React.FC<KeywordTriggerStatsPanelProps> = () => {
  const { showToast } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getKeywordTriggerStats();
      setStats(data);
    } catch (err) {
      showToast(`加载统计失败: ${err}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadStats();
    // 每 10 秒自动刷新
    const timer = setInterval(loadStats, 10000);
    return () => clearInterval(timer);
  }, [loadStats]);

  const handleResetStats = async () => {
    if (!window.confirm('确定要重置所有统计信息吗？')) return;
    try {
      await resetKeywordTriggerStats();
      showToast('统计已重置', 'success');
      loadStats();
    } catch (err) {
      showToast(`重置失败: ${err}`, 'error');
    }
  };

  const handleRefreshRules = async () => {
    try {
      await refreshKeywordTriggerRules();
      showToast('规则已刷新', 'success');
      loadStats();
    } catch (err) {
      showToast(`刷新失败: ${err}`, 'error');
    }
  };

  const handleConfigChange = async (key: string, value: any) => {
    if (!stats) return;
    setSavingConfig(true);
    try {
      await updateKeywordTriggerConfig({ [key]: value });
      showToast('配置已更新', 'success');
      loadStats();
    } catch (err) {
      showToast(`更新失败: ${err}`, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading && !stats) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (!stats) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          暂无统计数据
        </Typography>
      </Box>
    );
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return `${Math.floor(diff / 1000)}秒前`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Box>
      {/* 头部操作栏 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          关键词触发引擎统计信息
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
            onClick={handleRefreshRules}
            sx={{ textTransform: 'none', fontSize: '0.75rem' }}
          >
            刷新规则
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<RestartAltIcon sx={{ fontSize: 14 }} />}
            onClick={handleResetStats}
            sx={{ textTransform: 'none', fontSize: '0.75rem' }}
          >
            重置统计
          </Button>
        </Box>
      </Box>

      {/* 核心指标卡片 */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 3 }}>
        <Paper sx={{ p: 2, borderRadius: '8px' }}>
          <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', mb: 0.5 }}>
            规则数
          </Typography>
          <Typography sx={{ fontSize: '1.5rem', fontWeight: 600, color: 'text.primary' }}>
            {stats.totalRules}
          </Typography>
          <Typography sx={{ fontSize: '0.6875rem', color: 'text.disabled' }}>
            关键词数: {stats.totalKeywords}
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, borderRadius: '8px' }}>
          <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', mb: 0.5 }}>
            总触发次数
          </Typography>
          <Typography sx={{ fontSize: '1.5rem', fontWeight: 600, color: '#2563EB' }}>
            {stats.totalTriggers}
          </Typography>
          <Typography sx={{ fontSize: '0.6875rem', color: 'text.disabled' }}>
            匹配尝试: {stats.totalMatchAttempts}
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, borderRadius: '8px' }}>
          <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', mb: 0.5 }}>
            成功匹配
          </Typography>
          <Typography sx={{ fontSize: '1.5rem', fontWeight: 600, color: '#059669' }}>
            {stats.matchSuccessCount}
          </Typography>
          <Typography sx={{ fontSize: '0.6875rem', color: 'text.disabled' }}>
            成功率: {(stats.matchSuccessRate * 100).toFixed(1)}%
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, borderRadius: '8px' }}>
          <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', mb: 0.5 }}>
            单次最大触发
          </Typography>
          <Typography sx={{ fontSize: '1.5rem', fontWeight: 600, color: '#D97706' }}>
            {stats.config.maxTriggersPerMessage}
          </Typography>
          <Typography sx={{ fontSize: '0.6875rem', color: 'text.disabled' }}>
            阈值: {stats.config.threshold}
          </Typography>
        </Paper>
      </Box>

      {/* 配置面板 */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: '8px' }}>
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 2 }}>
          引擎配置
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 3 }}>
          <Box>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1 }}>
              匹配阈值: {stats.config.threshold}
            </Typography>
            <Slider
              value={stats.config.threshold}
              min={0}
              max={1}
              step={0.05}
              onChange={(_, value) => handleConfigChange('threshold', value)}
              disabled={savingConfig}
              size="small"
            />
          </Box>
          <Box>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1 }}>
              单次最大触发: {stats.config.maxTriggersPerMessage}
            </Typography>
            <Slider
              value={stats.config.maxTriggersPerMessage}
              min={1}
              max={10}
              step={1}
              marks
              onChange={(_, value) => handleConfigChange('maxTriggersPerMessage', value)}
              disabled={savingConfig}
              size="small"
            />
          </Box>
          <FormControl size="small" fullWidth>
            <InputLabel>匹配模式</InputLabel>
            <Select
              value={stats.config.matchMode}
              label="匹配模式"
              onChange={(e) => handleConfigChange('matchMode', e.target.value)}
              disabled={savingConfig}
            >
              <MenuItem value="exact">精确匹配</MenuItem>
              <MenuItem value="fuzzy">模糊匹配</MenuItem>
              <MenuItem value="semantic">语义匹配</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={stats.config.enabled}
                  onChange={(e) => handleConfigChange('enabled', e.target.checked)}
                  disabled={savingConfig}
                  size="small"
                />
              }
              label="启用关键词触发"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={stats.config.ignoreStopWords}
                  onChange={(e) => handleConfigChange('ignoreStopWords', e.target.checked)}
                  disabled={savingConfig}
                  size="small"
                />
              }
              label="忽略停用词"
            />
          </Box>
        </Box>
      </Paper>

      {/* Top 技能和关键词 */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
        <Paper sx={{ p: 3, borderRadius: '8px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <TrendingUpIcon sx={{ fontSize: 16, color: '#2563EB' }} />
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
              热门技能 Top 10
            </Typography>
          </Box>
          {stats.topSkills.length === 0 ? (
            <Typography sx={{ fontSize: '0.8125rem', color: 'text.disabled', textAlign: 'center', py: 3 }}>
              暂无触发记录
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {stats.topSkills.map((skill, idx) => (
                <Box
                  key={skill.skillId}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    p: 1,
                    borderRadius: '4px',
                    backgroundColor: idx === 0 ? '#EFF6FF' : 'transparent',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', width: 20 }}>
                      {idx + 1}
                    </Typography>
                    <Typography sx={{ fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {skill.skillName}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: '#2563EB' }}>
                    {skill.count}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Paper>

        <Paper sx={{ p: 3, borderRadius: '8px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <TrendingUpIcon sx={{ fontSize: 16, color: '#059669' }} />
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
              热门关键词 Top 10
            </Typography>
          </Box>
          {stats.topKeywords.length === 0 ? (
            <Typography sx={{ fontSize: '0.8125rem', color: 'text.disabled', textAlign: 'center', py: 3 }}>
              暂无触发记录
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {stats.topKeywords.map((kw) => (
                <Box
                  key={kw.keyword}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 1.5,
                    py: 0.5,
                    backgroundColor: '#ECFDF5',
                    borderRadius: '12px',
                  }}
                >
                  <Typography sx={{ fontSize: '0.75rem', color: '#059669' }}>
                    #{kw.keyword}
                  </Typography>
                  <Typography sx={{ fontSize: '0.6875rem', color: '#059669', fontWeight: 500 }}>
                    {kw.count}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Paper>
      </Box>

      {/* 最近触发记录 */}
      <Paper sx={{ p: 3, borderRadius: '8px' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <HistoryIcon sx={{ fontSize: 16, color: '#D97706' }} />
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
            最近触发记录
          </Typography>
        </Box>
        {stats.recentTriggers.length === 0 ? (
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.disabled', textAlign: 'center', py: 3 }}>
            暂无触发记录
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 300, overflowY: 'auto' }}>
            {stats.recentTriggers.slice(0, 20).map((trigger, idx) => (
              <Box
                key={idx}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  p: 1.5,
                  borderRadius: '4px',
                  backgroundColor: '#FAFAFA',
                  gap: 2,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                      {trigger.skillName}
                    </Typography>
                    <Typography sx={{ fontSize: '0.6875rem', color: 'text.disabled' }}>
                      {formatTime(trigger.timestamp)}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    "{trigger.message}"
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                    {trigger.matchedKeywords.map((kw) => (
                      <Box
                        key={kw}
                        sx={{
                          px: 0.75,
                          py: 0.125,
                          fontSize: '0.6875rem',
                          backgroundColor: '#FEF3C7',
                          color: '#D97706',
                          borderRadius: '3px',
                        }}
                      >
                        {kw}
                      </Box>
                    ))}
                  </Box>
                </Box>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', whiteSpace: 'nowrap' }}>
                  {trigger.score.toFixed(2)}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default KeywordTriggerStatsPanel;
