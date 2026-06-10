/**
 * WmsPredictionDashboard
 *
 * 智能预测看板 — 可折叠区域，展示 4 张统计卡片和 AI 预测检查按钮。
 * 折叠状态持久化到 localStorage (key: wms-prediction-dashboard-collapsed)。
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  CircularProgress,
  Collapse,
  IconButton,
  Tooltip,
  Grid,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import InventoryIcon from '@mui/icons-material/Inventory';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import type { PredictionDashboardData } from '../../types/wms';
import { getGrayScale } from '../../constants/theme';

const COLLAPSED_KEY = 'wms-prediction-dashboard-collapsed';

export interface WmsPredictionDashboardProps {
  data: PredictionDashboardData | null;
  loading: boolean;
  onCheckPrediction: () => Promise<void>;
  checking: boolean;
}

const WmsPredictionDashboard: React.FC<WmsPredictionDashboardProps> = ({
  data,
  loading,
  onCheckPrediction,
  checking,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    } catch {
      // localStorage 不可用时静默忽略
    }
  }, [collapsed]);

  const toggleCollapse = () => setCollapsed((prev) => !prev);

  return (
    <Card
      elevation={0}
      sx={{
        border: `1px solid ${gs.border}`,
        borderRadius: 2,
        mb: 3,
        borderLeft: '3px solid #6366F1',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          cursor: 'pointer',
          backgroundColor: gs.bgPage,
          borderBottom: collapsed ? 'none' : `1px solid ${gs.border}`,
        }}
        onClick={toggleCollapse}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoGraphIcon sx={{ color: '#6366F1', fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: gs.textPrimary }}>
            智能预测看板
          </Typography>
          <Typography variant="caption" sx={{ color: gs.textDisabled }}>
            EMA 指数平滑 · 短期消耗趋势预测
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            variant="contained"
            size="small"
            startIcon={checking ? <CircularProgress size={14} color="inherit" /> : <AssessmentIcon sx={{ fontSize: 16 }} />}
            onClick={(e) => {
              e.stopPropagation();
              onCheckPrediction();
            }}
            disabled={checking}
            sx={{
              textTransform: 'none',
              borderRadius: '8px',
              fontSize: '0.75rem',
              backgroundColor: '#6366F1',
              '&:hover': { backgroundColor: '#4F46E5' },
              mr: 1,
            }}
          >
            {checking ? '预测中...' : 'AI 预测检查'}
          </Button>
          <Tooltip title={collapsed ? '展开' : '收起'}>
            <IconButton size="small" sx={{ color: gs.textDisabled }}>
              {collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Content */}
      <Collapse in={!collapsed}>
        <CardContent sx={{ pt: 2, pb: '16px !important' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} sx={{ color: '#6366F1' }} />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                加载预测数据...
              </Typography>
            </Box>
          ) : !data ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography variant="body2" color="text.secondary">
                暂无预测数据，请点击「AI 预测检查」按钮进行扫描
              </Typography>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {/* 预测短缺数 */}
              <Grid item xs={12} sm={6} md={3}>
                <Card
                  elevation={0}
                  sx={{
                    border: '1px solid #FED7AA',
                    borderRadius: 2,
                    backgroundColor: '#FFF7ED',
                  }}
                >
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <TrendingDownIcon sx={{ color: '#F97316', fontSize: 18 }} />
                      <Typography variant="caption" sx={{ color: '#9A3412', fontWeight: 500 }}>
                        预测短缺
                      </Typography>
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#EA580C' }}>
                      {data.predictedShortageCount}
                    </Typography>
                    <Typography variant="caption" sx={{ color: gs.textDisabled }}>
                      活跃预警
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* 预测积压数 */}
              <Grid item xs={12} sm={6} md={3}>
                <Card
                  elevation={0}
                  sx={{
                    border: '1px solid #C7D2FE',
                    borderRadius: 2,
                    backgroundColor: '#EEF2FF',
                  }}
                >
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <InventoryIcon sx={{ color: '#6366F1', fontSize: 18 }} />
                      <Typography variant="caption" sx={{ color: '#3730A3', fontWeight: 500 }}>
                        预测积压
                      </Typography>
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#4F46E5' }}>
                      {data.predictedOverstockCount}
                    </Typography>
                    <Typography variant="caption" sx={{ color: gs.textDisabled }}>
                      活跃预警
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* 待补货 SKU 数 */}
              <Grid item xs={12} sm={6} md={3}>
                <Card
                  elevation={0}
                  sx={{
                    border: `1px solid ${gs.border}`,
                    borderRadius: 2,
                    backgroundColor: gs.bgPanel,
                  }}
                >
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <AssessmentIcon sx={{ color: gs.textMuted, fontSize: 18 }} />
                      <Typography variant="caption" sx={{ color: gs.textSecondary, fontWeight: 500 }}>
                        待补货 SKU
                      </Typography>
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: gs.textPrimary }}>
                      {data.pendingReplenishSkuCount}
                    </Typography>
                    <Typography variant="caption" sx={{ color: gs.textDisabled }}>
                      需采购/调拨
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* 数据覆盖率 */}
              <Grid item xs={12} sm={6} md={3}>
                <Card
                  elevation={0}
                  sx={{
                    border: `1px solid ${gs.border}`,
                    borderRadius: 2,
                    backgroundColor: gs.bgPanel,
                  }}
                >
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <AutoGraphIcon sx={{ color: gs.textMuted, fontSize: 18 }} />
                      <Typography variant="caption" sx={{ color: gs.textSecondary, fontWeight: 500 }}>
                        数据覆盖率
                      </Typography>
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: gs.textPrimary }}>
                      {data.dataCoverageRate}%
                    </Typography>
                    <Typography variant="caption" sx={{ color: gs.textDisabled }}>
                      有充足历史的 SKU 占比
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Collapse>
    </Card>
  );
};

export default WmsPredictionDashboard;
