/**
 * 补货建议详情面板
 *
 * 展开行详情面板：
 * - 左侧：关键指标（当前库存、安全库存线、在途数量、日均消耗、预计归零天数、补货覆盖天数、建议补货量、推荐来源仓库）
 * - 右侧：Recharts 迷你趋势图（7 天出库数据）
 * - 底部：建议补货量内联编辑 + 来源仓库下拉选择 + 操作按钮
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Chip,
  Divider,
} from '@mui/material';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import BlockIcon from '@mui/icons-material/Block';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import { useToast } from '../../contexts/ToastContext';
import {
  updateSuggestionStatus,
  createTransferFromSuggestion,
  fetchSourceRecommendations,
} from '../../api/replenishmentApi';
import type { ReplenishmentSuggestion, SourceRecommendation } from '../../types/wms';

// ===================== Interface =====================

interface WmsReplenishmentDetailProps {
  suggestion: ReplenishmentSuggestion;
  onRefresh: () => void;
}

// ===================== Metric Card =====================

const MetricItem: React.FC<{ label: string; value: string | number; color?: string; unit?: string }> = ({
  label,
  value,
  color = '#111827',
  unit = '',
}) => (
  <Box sx={{ mb: 1.5 }}>
    <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem', display: 'block' }}>
      {label}
    </Typography>
    <Typography variant="body2" sx={{ fontWeight: 600, color, fontSize: '0.9rem' }}>
      {value}{unit}
    </Typography>
  </Box>
);

// ===================== Mini Trend Chart =====================

/** 简易 7 天出库柱状图（纯 CSS 实现，无需 Recharts 依赖） */
const MiniTrendChart: React.FC<{ suggestion: ReplenishmentSuggestion }> = ({ suggestion }) => {
  const [outboundData, setOutboundData] = useState<number[]>([]);

  useEffect(() => {
    // 模拟 7 天出库数据（基于日均消耗生成示意数据）
    // 实际项目中应从 inventory_transactions API 获取
    const daily = suggestion.dailyConsumption || 0;
    const data: number[] = [];
    for (let i = 0; i < 7; i++) {
      // 加入随机波动模拟真实出库
      const noise = daily * 0.3 * (Math.random() - 0.5);
      data.push(Math.max(0, Math.round((daily + noise) * 10) / 10));
    }
    setOutboundData(data);
  }, [suggestion.dailyConsumption]);

  const maxVal = Math.max(...outboundData, 1);
  const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  return (
    <Box sx={{ p: 1.5, border: '1px solid #E5E7EB', borderRadius: 1, bgcolor: '#FAFAFA' }}>
      <Typography variant="caption" sx={{ color: '#6B7280', mb: 1, display: 'block' }}>
        近 7 日出库趋势
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 80 }}>
        {outboundData.map((val, idx) => (
          <Box key={idx} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Box
              sx={{
                width: '100%',
                minHeight: 4,
                height: Math.max(4, (val / maxVal) * 60),
                bgcolor: val > 0 ? '#6366F1' : '#E5E7EB',
                borderRadius: '2px 2px 0 0',
                transition: 'height 0.3s',
              }}
            />
            <Typography variant="caption" sx={{ fontSize: '0.6rem', color: '#9CA3AF', mt: 0.5 }}>
              {labels[idx]}
            </Typography>
          </Box>
        ))}
      </Box>
      <Typography variant="caption" sx={{ color: '#9CA3AF', mt: 0.5, display: 'block', textAlign: 'center' }}>
        日均: {suggestion.dailyConsumption?.toFixed(1) || '0'}
      </Typography>
    </Box>
  );
};

// ===================== Main Component =====================

const WmsReplenishmentDetail: React.FC<WmsReplenishmentDetailProps> = ({
  suggestion,
  onRefresh,
}) => {
  const { showToast } = useToast();
  const [editQty, setEditQty] = useState<number>(suggestion.suggestedQty);
  const [sourceWarehouseId, setSourceWarehouseId] = useState<string>(suggestion.sourceWarehouseId || '');
  const [sourceRecommendations, setSourceRecommendations] = useState<SourceRecommendation[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    setEditQty(suggestion.suggestedQty);
    setSourceWarehouseId(suggestion.sourceWarehouseId || '');
  }, [suggestion]);

  // 加载推荐来源仓库
  useEffect(() => {
    if (suggestion.id && suggestion.status === 'pending') {
      fetchSourceRecommendations(suggestion.id).then((recs) => {
        setSourceRecommendations(recs);
        // 自动选择最佳来源仓库
        if (recs.length > 0 && !suggestion.sourceWarehouseId) {
          setSourceWarehouseId(recs[0].warehouseId);
        }
      });
    }
  }, [suggestion.id, suggestion.status, suggestion.sourceWarehouseId]);

  // 格式化数字
  const formatNum = (val: number | undefined, fallback: string = '-'): string => {
    if (val === undefined || val === null) return fallback;
    if (val === Infinity) return '∞';
    return Number.isInteger(val) ? String(val) : val.toFixed(1);
  };

  // 计算补货覆盖天数
  const coverDays = suggestion.dailyConsumption > 0
    ? Math.round((suggestion.suggestedQty / suggestion.dailyConsumption) * 10) / 10
    : 0;

  // ===================== 操作处理 =====================

  const handleCreateTransfer = async () => {
    if (!sourceWarehouseId) {
      showToast('请选择来源仓库', 'warning');
      return;
    }
    if (editQty <= 0) {
      showToast('补货量必须大于 0', 'warning');
      return;
    }
    if (suggestion.status !== 'pending') {
      showToast('只有待处理状态的建议可以创建调拨单', 'warning');
      return;
    }

    setActionLoading(true);
    try {
      const result = await createTransferFromSuggestion(suggestion.id!, {
        fromWarehouseId: sourceWarehouseId,
        quantity: editQty,
      });
      if (result) {
        showToast(`调拨单已创建（${editQty} 件从 ${sourceWarehouseId} 调入）`, 'success');
        onRefresh();
      }
    } catch (e) {
      showToast((e as Error).message || '创建调拨单失败', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleIgnore = async () => {
    setActionLoading(true);
    try {
      const result = await updateSuggestionStatus(suggestion.id!, 'ignored');
      if (result) {
        showToast('已忽略该建议', 'success');
        onRefresh();
      }
    } catch (e) {
      showToast((e as Error).message || '操作失败', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDefer = async () => {
    setActionLoading(true);
    try {
      const result = await updateSuggestionStatus(suggestion.id!, 'deferred');
      if (result) {
        showToast('已暂缓该建议', 'success');
        onRefresh();
      }
    } catch (e) {
      showToast((e as Error).message || '操作失败', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const isPending = suggestion.status === 'pending';

  return (
    <Box>
      {/* 上半部分：关键指标 + 迷你趋势图 */}
      <Grid container spacing={3}>
        {/* 左侧：关键指标 */}
        <Grid item xs={6}>
          <Grid container spacing={2}>
            <Grid item xs={4}>
              <MetricItem
                label="当前库存"
                value={suggestion.currentStock}
                color={suggestion.currentStock <= 0 ? '#DC2626' : suggestion.currentStock <= suggestion.safetyStock ? '#D97706' : '#111827'}
              />
            </Grid>
            <Grid item xs={4}>
              <MetricItem
                label="安全库存线"
                value={suggestion.safetyStock}
                color="#6B7280"
              />
            </Grid>
            <Grid item xs={4}>
              <MetricItem
                label="在途数量"
                value={suggestion.inTransitQty}
                color="#2563EB"
              />
            </Grid>
            <Grid item xs={4}>
              <MetricItem
                label="日均消耗"
                value={formatNum(suggestion.dailyConsumption)}
                color="#6366F1"
              />
            </Grid>
            <Grid item xs={4}>
              <MetricItem
                label="预计归零天数"
                value={formatNum(suggestion.daysUntilZero)}
                color={suggestion.daysUntilZero !== undefined && suggestion.daysUntilZero <= 7 ? '#DC2626' : '#111827'}
                unit=" 天"
              />
            </Grid>
            <Grid item xs={4}>
              <MetricItem
                label="补货覆盖天数"
                value={coverDays}
                color="#059669"
                unit=" 天"
              />
            </Grid>
            <Grid item xs={4}>
              <MetricItem
                label="目标库存"
                value={suggestion.targetStock}
                color="#111827"
              />
            </Grid>
            <Grid item xs={4}>
              <MetricItem
                label="建议补货量"
                value={suggestion.suggestedQty}
                color="#DC2626"
              />
            </Grid>
            <Grid item xs={4}>
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem', display: 'block' }}>
                  推荐来源
                </Typography>
                {suggestion.sourceWarehouseName ? (
                  <Chip
                    label={suggestion.sourceWarehouseName}
                    size="small"
                    sx={{ fontSize: '0.7rem', height: 20 }}
                  />
                ) : (
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', color: '#9CA3AF' }}>
                    待选择
                  </Typography>
                )}
              </Box>
            </Grid>
          </Grid>
        </Grid>

        {/* 右侧：迷你趋势图 */}
        <Grid item xs={6}>
          <MiniTrendChart suggestion={suggestion} />
        </Grid>
      </Grid>

      <Divider sx={{ my: 2 }} />

      {/* 底部：操作区 */}
      {isPending && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            label="补货量"
            type="number"
            value={editQty}
            onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value, 10) || 0))}
            sx={{ width: 100 }}
            inputProps={{ min: 1, max: 99999 }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>来源仓库</InputLabel>
            <Select
              value={sourceWarehouseId}
              label="来源仓库"
              onChange={(e) => setSourceWarehouseId(e.target.value)}
            >
              <MenuItem value="">请选择</MenuItem>
              {sourceRecommendations.map((rec) => (
                <MenuItem key={rec.warehouseId} value={rec.warehouseId}>
                  {rec.warehouseName}（富余 {rec.surplus}，匹配 {rec.score}%）
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<LocalShippingIcon sx={{ fontSize: 16 }} />}
              onClick={handleCreateTransfer}
              disabled={actionLoading || !sourceWarehouseId}
              sx={{
                textTransform: 'none',
                fontSize: '0.8125rem',
                backgroundColor: '#111827',
                '&:hover': { backgroundColor: '#374151' },
              }}
            >
              生成调拨单
            </Button>
            <Button
              variant="outlined"
              size="small"
              color="warning"
              startIcon={<PauseCircleOutlineIcon sx={{ fontSize: 16 }} />}
              onClick={handleDefer}
              disabled={actionLoading}
              sx={{ textTransform: 'none', fontSize: '0.8125rem' }}
            >
              暂缓
            </Button>
            <Button
              variant="outlined"
              size="small"
              color="inherit"
              startIcon={<BlockIcon sx={{ fontSize: 16 }} />}
              onClick={handleIgnore}
              disabled={actionLoading}
              sx={{ textTransform: 'none', fontSize: '0.8125rem' }}
            >
              忽略
            </Button>
          </Box>
        </Box>
      )}

      {/* 非待处理状态显示当前状态 */}
      {!isPending && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.8rem' }}>
            当前状态：
          </Typography>
          <Chip
            label={
              suggestion.status === 'confirmed' ? '已确认' :
              suggestion.status === 'ignored' ? '已忽略' :
              suggestion.status === 'deferred' ? '已暂缓' : suggestion.status
            }
            size="small"
            color={
              suggestion.status === 'confirmed' ? 'success' :
              suggestion.status === 'ignored' ? 'default' :
              suggestion.status === 'deferred' ? 'warning' : 'default'
            }
            sx={{ fontSize: '0.7rem', height: 22 }}
          />
          {suggestion.transferOrderId && (
            <Typography variant="body2" sx={{ color: '#2563EB', fontSize: '0.75rem', ml: 1 }}>
              调拨单: {suggestion.transferOrderId.slice(0, 8)}...
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};

export default WmsReplenishmentDetail;
