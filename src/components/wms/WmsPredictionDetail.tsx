/**
 * WmsPredictionDetail
 *
 * 预测详情抽屉 — 展示 SKU 预测趋势图（Recharts LineChart）。
 * 包含：当前库存、日均消耗、预计归零天数、置信度标签。
 */

import React, { useState, useEffect } from 'react';
import {
  Drawer,
  Box,
  Typography,
  Chip,
  CircularProgress,
  Button,
  Divider,
  IconButton,
  Grid,
  Card,
  CardContent,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
} from 'recharts';
import type { WmsAlert, PredictionDetail as PredictionDetailType } from '../../types/wms';
import { getGrayScale } from '../../constants/theme';
import { getApiUrl } from '../../utils/api';

interface WmsPredictionDetailProps {
  open: boolean;
  onClose: () => void;
  sku: string;
  warehouseId: string;
  alert: WmsAlert;
  onResolve?: (alertId: number) => void;
  onIgnore?: (alertId: number) => void;
}

const CONFIDENCE_CONFIG: Record<string, { label: string; color: 'success' | 'warning' | 'error'; hex: string }> = {
  high: { label: '高置信度', color: 'success', hex: '#059669' },
  medium: { label: '中置信度', color: 'warning', hex: '#D97706' },
  low: { label: '低置信度', color: 'error', hex: '#DC2626' },
};

/** 合并历史数据和预测曲线为单一图表数据 */
interface ChartDataPoint {
  date: string;
  stock?: number;
  outbound?: number;
  predictedStock?: number;
  safetyStock?: number;
}

const WmsPredictionDetail: React.FC<WmsPredictionDetailProps> = ({
  open,
  onClose,
  sku,
  warehouseId,
  alert,
  onResolve,
  onIgnore,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [data, setData] = useState<PredictionDetailType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !sku || !warehouseId) return;

    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          getApiUrl(`/api/wms/alerts/prediction/${encodeURIComponent(sku)}?warehouseId=${encodeURIComponent(warehouseId)}`)
        );
        const json = await res.json();
        if (json.code === 0) {
          setData(json.data);
        } else {
          setError(json.message || '获取预测详情失败');
        }
      } catch {
        setError('网络错误');
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [open, sku, warehouseId]);

  // 构建合并图表数据
  const chartData: ChartDataPoint[] = React.useMemo(() => {
    if (!data) return [];

    const points: ChartDataPoint[] = [];

    // 添加历史数据
    for (const h of data.historyData) {
      points.push({
        date: h.date,
        stock: h.stock,
        outbound: h.outbound,
        safetyStock: data.safetyStockLine,
      });
    }

    // 添加预测数据
    for (const p of data.predictionCurve) {
      // 查找是否已有此日期的历史数据
      const existing = points.find((pt) => pt.date === p.date);
      if (existing) {
        existing.predictedStock = p.predictedStock;
      } else {
        points.push({
          date: p.date,
          predictedStock: p.predictedStock,
          safetyStock: data.safetyStockLine,
        });
      }
    }

    return points;
  }, [data]);

  const confidenceCfg = data ? CONFIDENCE_CONFIG[data.confidence] : null;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 600, md: 700 },
          p: 0,
          borderLeft: `1px solid ${gs.border}`,
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          py: 2,
          borderBottom: `1px solid ${gs.border}`,
          backgroundColor: gs.bgPage,
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
            SKU 预测详情
          </Typography>
          <Typography variant="body2" sx={{ color: gs.textMuted, fontSize: '0.8rem', fontFamily: 'monospace' }}>
            {sku} · 仓库 {warehouseId}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: gs.textMuted }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress size={32} sx={{ color: '#6366F1' }} />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              正在加载预测数据...
            </Typography>
          </Box>
        ) : error ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          </Box>
        ) : data ? (
          <>
            {/* 关键指标卡片 */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={6}>
                <Card
                  elevation={0}
                  sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, backgroundColor: gs.bgPage }}
                >
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" sx={{ color: gs.textMuted }}>
                      当前库存
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: gs.textPrimary }}>
                      {data.currentStock}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6}>
                <Card
                  elevation={0}
                  sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, backgroundColor: gs.bgPage }}
                >
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" sx={{ color: gs.textMuted }}>
                      日均消耗 (EMA)
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: gs.textPrimary }}>
                      {data.dailyConsumption.toFixed(1)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6}>
                <Card
                  elevation={0}
                  sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, backgroundColor: gs.bgPage }}
                >
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" sx={{ color: gs.textMuted }}>
                      预计{data.daysUntilZero >= 9999 ? '不' : ''}归零天数
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 700,
                        color: data.daysUntilZero <= 7 ? '#DC2626'
                          : data.daysUntilZero <= 14 ? '#EA580C'
                          : gs.textPrimary,
                      }}
                    >
                      {data.daysUntilZero >= 9999 ? '∞' : data.daysUntilZero}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6}>
                <Card
                  elevation={0}
                  sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, backgroundColor: gs.bgPage }}
                >
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" sx={{ color: gs.textMuted }}>
                      置信度
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                      {confidenceCfg && (
                        <Chip
                          label={confidenceCfg.label}
                          size="small"
                          sx={{
                            backgroundColor: confidenceCfg.hex + '1A',
                            color: confidenceCfg.hex,
                            fontWeight: 600,
                            fontSize: '0.75rem',
                          }}
                        />
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* 趋势图 */}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: gs.textSecondary }}>
              📈 库存消耗趋势预测
            </Typography>

            <Box sx={{ width: '100%', height: 350, mb: 3 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gs.bgHover} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: gs.textMuted }}
                    tickLine={false}
                    axisLine={{ stroke: gs.border }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: gs.textMuted }}
                    tickLine={false}
                    axisLine={{ stroke: gs.border }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: gs.bgPanel,
                      border: `1px solid ${gs.border}`,
                      borderRadius: 8,
                      fontSize: '0.75rem',
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '0.75rem' }}
                  />
                  {/* 历史库存线 */}
                  <Line
                    type="monotone"
                    dataKey="stock"
                    stroke="#2563EB"
                    strokeWidth={2}
                    dot={false}
                    name="历史库存"
                    connectNulls
                  />
                  {/* 预测库存线 */}
                  <Line
                    type="monotone"
                    dataKey="predictedStock"
                    stroke="#F97316"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="预测库存"
                    connectNulls
                  />
                  {/* 预测区间（半透明区域） */}
                  <Area
                    type="monotone"
                    dataKey="predictedStock"
                    fill="#F97316"
                    fillOpacity={0.1}
                    stroke="none"
                    name="预测区间"
                  />
                  {/* 安全库存线 */}
                  <ReferenceLine
                    y={data.safetyStockLine}
                    stroke="#DC2626"
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    label={{
                      value: `安全库存: ${data.safetyStockLine}`,
                      position: 'right',
                      fontSize: 11,
                      fill: '#DC2626',
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </Box>

            {/* 预警消息 */}
            <Card
              elevation={0}
              sx={{
                border: `1px solid ${gs.border}`,
                borderRadius: 2,
                backgroundColor: gs.bgPage,
                mb: 2,
              }}
            >
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <TrendingDownIcon sx={{ color: '#F97316', fontSize: 18, mt: 0.25 }} />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: gs.textPrimary }}>
                      预警消息
                    </Typography>
                    <Typography variant="body2" sx={{ color: gs.textMuted, fontSize: '0.8rem' }}>
                      {alert.message}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>

            {/* 图例说明 */}
            <Card
              elevation={0}
              sx={{
                border: `1px solid ${gs.border}`,
                borderRadius: 2,
                backgroundColor: gs.bgPage,
                mb: 3,
              }}
            >
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: gs.textMuted, display: 'block', mb: 1 }}>
                  图例说明
                </Typography>
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 20, height: 3, backgroundColor: '#2563EB', borderRadius: 1 }} />
                      <Typography variant="caption" color="text.secondary">历史库存（蓝实线）</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 20, height: 0, borderTop: '2px dashed #F97316' }} />
                      <Typography variant="caption" color="text.secondary">预测库存（橙虚线）</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 20, height: 0, borderTop: '2px dashed #DC2626' }} />
                      <Typography variant="caption" color="text.secondary">安全库存线（红虚线）</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 20, height: 12, backgroundColor: '#F97316', opacity: 0.15, borderRadius: 0.5 }} />
                      <Typography variant="caption" color="text.secondary">预测区间（橙半透明）</Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </>
        ) : null}
      </Box>

      {/* Footer Actions */}
      {alert.status === 'active' && (onResolve || onIgnore) && (
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            px: 3,
            py: 2,
            borderTop: `1px solid ${gs.border}`,
            backgroundColor: gs.bgPage,
          }}
        >
          {onResolve && (
            <Button
              variant="contained"
              size="small"
              startIcon={<CheckCircleOutlineIcon />}
              onClick={() => {
                if (alert.id !== undefined) onResolve(alert.id);
                onClose();
              }}
              sx={{
                textTransform: 'none',
                borderRadius: '8px',
                backgroundColor: '#059669',
                '&:hover': { backgroundColor: '#047857' },
              }}
            >
              标记已解决
            </Button>
          )}
          {onIgnore && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<RemoveCircleOutlineIcon />}
              onClick={() => {
                if (alert.id !== undefined) onIgnore(alert.id);
                onClose();
              }}
              sx={{
                textTransform: 'none',
                borderRadius: '8px',
                borderColor: gs.border,
                color: gs.textMuted,
                '&:hover': { borderColor: gs.borderDarker, backgroundColor: gs.bgHover },
              }}
            >
              忽略
            </Button>
          )}
        </Box>
      )}
    </Drawer>
  );
};

export default WmsPredictionDetail;
