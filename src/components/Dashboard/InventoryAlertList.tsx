import React, { useMemo, useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Paper,
  CircularProgress,
  Alert,
  useTheme,
} from '@mui/material';
import { getGrayScale } from '../../constants/theme';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import InventoryIcon from '@mui/icons-material/Inventory';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { ALL_WAREHOUSES } from './WarehouseSelector';
import { useWarehouseCapability } from '../../capabilities/warehouse';
import type { TimeRange } from './TimeRangeSelector';
import { API_BASE } from '../../constants/api';

interface InventoryAlertListProps {
  warehouseId?: string;
  timeRange?: TimeRange;
}

/** 从 API 获取的预测型预警 */
interface PredictionAlertItem {
  id: number;
  alertType: 'predicted_shortage' | 'predicted_overstock';
  severity: string;
  sku: string;
  message: string;
  warehouseId: string;
  status: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const InventoryAlertList: React.FC<InventoryAlertListProps> = ({ warehouseId = ALL_WAREHOUSES, timeRange }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const { settings } = useAppSettings();
  const ageWarningDays = settings.dashboard.ageWarningDays;

  // 从 Context 获取数据
  const { warehouses, inventory, loading, error } = useWarehouseCapability({ includeDashboard: true });

  // 获取预测型预警
  const [predictionAlerts, setPredictionAlerts] = useState<PredictionAlertItem[]>([]);
  const [predictionLoading, setPredictionLoading] = useState(false);

  useEffect(() => {
    const fetchPredictionAlerts = async () => {
      setPredictionLoading(true);
      try {
        const res = await fetch(`${API_BASE}/wms/alerts?status=active`);
        const json = await res.json();
        if (json.code === 0 && Array.isArray(json.data)) {
          const predicted = json.data.filter(
            (a: PredictionAlertItem) =>
              a.alertType === 'predicted_shortage' || a.alertType === 'predicted_overstock'
          );
          setPredictionAlerts(predicted);
        }
      } catch {
        // 静默失败
      } finally {
        setPredictionLoading(false);
      }
    };

    fetchPredictionAlerts();
  }, []);

  const warehouseNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    warehouses.forEach((w) => {
      map[w.id] = w.name;
    });
    return map;
  }, [warehouses]);

  // 过滤出库龄 >= ageWarningDays 的 SKU
  const filteredItems = useMemo(() => {
    const filtered = inventory.filter((item) => {
      // 计算库龄天数
      const inboundDate = new Date(item.inboundDate);
      const today = new Date();
      const ageDays = Math.floor((today.getTime() - inboundDate.getTime()) / (1000 * 60 * 60 * 24));

      if (ageDays < ageWarningDays) return false;

      // 按仓库过滤
      if (warehouseId !== ALL_WAREHOUSES && item.warehouseId !== warehouseId) return false;

      return true;
    });

    // 按库龄降序排列
    return filtered.sort((a, b) => {
      const dateA = new Date(a.inboundDate);
      const dateB = new Date(b.inboundDate);
      return dateA.getTime() - dateB.getTime();
    });
  }, [warehouseId, ageWarningDays, inventory]);

  // 获取预警等级
  const getAlertLevel = (inboundDate: string): { label: string; color: 'warning' | 'error'; bgColor: string } => {
    const date = new Date(inboundDate);
    const today = new Date();
    const ageDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (ageDays >= 90) {
      return { label: '严重', color: 'error', bgColor: '#FEF2F2' };
    } else if (ageDays >= 60) {
      return { label: '警告', color: 'warning', bgColor: '#FFFBEB' };
    }
    return { label: '正常', color: 'warning', bgColor: '#FFFBEB' };
  };

  const displayItems = filteredItems.slice(0, 20);
  const totalCount = filteredItems.length;

  if (loading) {
    return (
      <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, height: '100%' }}>
        <CardContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
          <CircularProgress size={30} sx={{ color: gs.textPrimary }} />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, height: '100%' }}>
        <CardContent>
          <Alert severity="error">{error}</Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, height: '100%' }}>
      <CardHeader
        title={
          <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: gs.textPrimary }}>
            库存预警列表
          </Typography>
        }
        subheader={
          <Typography sx={{ fontSize: '0.75rem', color: gs.textDisabled, mt: 0.25 }}>
            库龄 ≥ {ageWarningDays} 天的 SKU
          </Typography>
        }
        action={
          (totalCount + predictionAlerts.length) > 0 ? (
            <Chip
              label={`${totalCount + predictionAlerts.length} 条预警`}
              size="small"
              sx={{ backgroundColor: isDark ? '#7F1D1D' : '#FEF2F2', color: '#EF4444', fontSize: '0.75rem', height: 24 }}
            />
          ) : undefined
        }
      />
      <CardContent sx={{ pt: 0, pb: '16px !important' }}>
        {/* 预测型预警区域 */}
        {predictionAlerts.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TrendingDownIcon sx={{ color: '#F97316', fontSize: 16 }} />
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: gs.textSecondary }}>
                🤖 AI 预测预警
              </Typography>
              <Chip
                label={`${predictionAlerts.length} 条`}
                size="small"
                sx={{ backgroundColor: isDark ? '#431407' : '#FFF7ED', color: '#EA580C', fontSize: '0.7rem', height: 20 }}
              />
            </Box>
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{ border: `1px solid ${isDark ? '#431407' : '#FED7AA'}`, borderRadius: 1, maxHeight: 160, overflow: 'auto' }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: isDark ? '#431407' : '#FFF7ED' }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.7rem', color: isDark ? '#FDBA74' : '#9A3412', py: 0.75 }}>
                      SKU
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.7rem', color: isDark ? '#FDBA74' : '#9A3412', py: 0.75 }}>
                      类型
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.7rem', color: isDark ? '#FDBA74' : '#9A3412', py: 0.75 }}>
                      严重程度
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.7rem', color: isDark ? '#FDBA74' : '#9A3412', py: 0.75 }}>
                      消息
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {predictionAlerts.slice(0, 5).map((pa) => (
                    <TableRow key={pa.id} hover>
                      <TableCell sx={{ fontSize: '0.75rem', color: gs.textPrimary, py: 0.75, fontFamily: 'monospace' }}>
                        {pa.sku || '-'}
                      </TableCell>
                      <TableCell sx={{ py: 0.75 }}>
                        <Chip
                          label={pa.alertType === 'predicted_shortage' ? '预测短缺' : '预测积压'}
                          size="small"
                          sx={{
                            backgroundColor: pa.alertType === 'predicted_shortage' ? '#F97316' : '#6366F1',
                            color: '#FFFFFF',
                            fontSize: '0.65rem',
                            height: 18,
                            fontWeight: 600,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 0.75 }}>
                        <Chip
                          label={pa.severity === 'critical' ? '紧急' : pa.severity === 'high' ? '高' : pa.severity === 'medium' ? '中' : '低'}
                          size="small"
                          sx={{
                            backgroundColor:
                              pa.severity === 'critical' ? '#7C3AED' :
                              pa.severity === 'high' ? '#DC2626' :
                              pa.severity === 'medium' ? '#EA580C' : '#2563EB',
                            color: '#FFFFFF',
                            fontSize: '0.65rem',
                            height: 18,
                            fontWeight: 600,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.7rem', color: gs.textMuted, py: 0.75, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pa.message}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {predictionAlerts.length > 5 && (
              <Typography sx={{ fontSize: '0.7rem', color: gs.textDisabled, mt: 0.5, textAlign: 'center' }}>
                共 {predictionAlerts.length} 条预测预警，仅显示前 5 条
              </Typography>
            )}
          </Box>
        )}

        {totalCount === 0 && predictionAlerts.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 48, color: '#10B981', mb: 1 }} />
            <Typography sx={{ fontSize: '0.875rem', color: '#10B981', fontWeight: 500 }}>
              ✅ 无库存预警
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textDisabled, mt: 0.5 }}>
              所有 SKU 库龄均在 {ageWarningDays} 天以内
            </Typography>
          </Box>
        ) : (
          <Box>
            {totalCount > 0 && (
            <>
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{ border: `1px solid ${gs.border}`, borderRadius: 1, maxHeight: 320, overflow: 'auto' }}
            >
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: gs.textMuted, py: 1 }}>
                      SKU编号
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: gs.textMuted, py: 1 }}>
                      商品名称
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: gs.textMuted, py: 1 }}>
                      所在仓库
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: gs.textMuted, py: 1 }}>
                      库龄（天）
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: gs.textMuted, py: 1 }}>
                      库存数量
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: gs.textMuted, py: 1 }}>
                      预警等级
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {displayItems.map((item) => {
                    const alertLevel = getAlertLevel(item.inboundDate);
                    const inboundDate = new Date(item.inboundDate);
                    const today = new Date();
                    const ageDays = Math.floor((today.getTime() - inboundDate.getTime()) / (1000 * 60 * 60 * 24));

                    return (
                      <TableRow key={item.id} hover>
                        <TableCell sx={{ fontSize: '0.8125rem', color: gs.textPrimary, py: 1 }}>
                          {item.sku}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8125rem', color: gs.textPrimary, py: 1 }}>
                          {item.name}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8125rem', color: gs.textMuted, py: 1 }}>
                          {warehouseNameMap[item.warehouseId] || item.warehouseId}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8125rem', color: ageDays >= 90 ? '#EF4444' : '#F59E0B', fontWeight: 600, py: 1 }}>
                          {ageDays}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8125rem', color: gs.textPrimary, py: 1 }}>
                          {item.quantity}
                        </TableCell>
                        <TableCell sx={{ py: 1 }}>
                          <Chip
                            label={alertLevel.label}
                            size="small"
                            sx={{
                              backgroundColor: isDark ? (alertLevel.color === 'error' ? '#7F1D1D' : '#78350F') : alertLevel.bgColor,
                              color: alertLevel.color === 'error' ? '#EF4444' : '#F59E0B',
                              fontSize: '0.7rem',
                              height: 20,
                              fontWeight: 600,
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            {totalCount > 20 && (
              <Typography sx={{ fontSize: '0.75rem', color: gs.textDisabled, mt: 1, textAlign: 'center' }}>
                共 {totalCount} 条预警，仅显示前 20 条
              </Typography>
            )}
            </>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default InventoryAlertList;
