/**
 * 异常预警页面
 *
 * 查看预警列表、解决/忽略预警、手动触发预警检查。
 * 集成智能预测看板和预测详情抽屉。
 *
 * API: GET /api/wms/alerts, POST /api/wms/alerts/check,
 *      POST /api/wms/alerts/:id/resolve, POST /api/wms/alerts/:id/ignore,
 *      GET /api/wms/alerts/prediction/dashboard
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import PageHeader from '../components/Common/PageHeader';
import WmsAlertList from '../components/wms/WmsAlertList';
import WmsPredictionDashboard from '../components/wms/WmsPredictionDashboard';
import WmsPredictionDetail from '../components/wms/WmsPredictionDetail';
import { subscribeRefresh } from '../App';
import { useToast } from '../contexts/ToastContext';
import type { WmsAlert, PredictionDashboardData } from '../types/wms';

const BASE_URL = 'http://localhost:3001';

const WmsAlertPage: React.FC = () => {
  const { showToast } = useToast();

  const [alerts, setAlerts] = useState<WmsAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [filterAlertType, setFilterAlertType] = useState<string>('all');

  // 预测看板数据
  const [predictionData, setPredictionData] = useState<PredictionDashboardData | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);

  // 预测详情抽屉
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailAlert, setDetailAlert] = useState<WmsAlert | null>(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/wms/alerts`);
      const json = await res.json();
      if (json.code === 0 || json.success) {
        setAlerts(json.data || []);
      } else {
        showToast(json.message || json.error || '获取预警数据失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const fetchPredictionDashboard = useCallback(async () => {
    setPredictionLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/wms/alerts/prediction/dashboard`);
      const json = await res.json();
      if (json.code === 0) {
        setPredictionData(json.data);
      }
    } catch {
      // 静默失败，预测看板不是必需的
    } finally {
      setPredictionLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    fetchPredictionDashboard();
  }, [fetchAlerts, fetchPredictionDashboard]);

  useEffect(() => {
    const unsub = subscribeRefresh('wms-alerts', () => {
      fetchAlerts();
      fetchPredictionDashboard();
    });
    return unsub;
  }, [fetchAlerts, fetchPredictionDashboard]);

  /** 手动触发预警检查（规则 + 预测） */
  const handleCheck = async () => {
    setChecking(true);
    try {
      const res = await fetch(`${BASE_URL}/api/wms/alerts/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includePrediction: true }),
      });
      const json = await res.json();
      if (json.code === 0 || json.success) {
        const data = json.data;
        const total = (data?.newAlerts ?? 0);
        const shortage = data?.predictedShortageAlerts ?? 0;
        const overstock = data?.predictedOverstockAlerts ?? 0;
        const parts: string[] = [];
        if (total > 0) parts.push(`${total} 条新预警`);
        if (shortage > 0) parts.push(`${shortage} 条预测短缺`);
        if (overstock > 0) parts.push(`${overstock} 条预测积压`);
        showToast(`预警检查完成，${parts.length > 0 ? parts.join('、') : '无新预警'}`, 'success');
        fetchAlerts();
        fetchPredictionDashboard();
      } else {
        showToast(json.message || json.error || '检查失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    } finally {
      setChecking(false);
    }
  };

  /** 标记预警已解决 */
  const handleResolve = async (alertId: number) => {
    try {
      const res = await fetch(`${BASE_URL}/api/wms/alerts/${alertId}/resolve`, { method: 'POST' });
      const json = await res.json();
      if (json.code === 0 || json.success) {
        showToast('已标记为已解决', 'success');
        fetchAlerts();
        fetchPredictionDashboard();
      } else {
        showToast(json.message || json.error || '操作失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    }
  };

  /** 忽略预警 */
  const handleIgnore = async (alertId: number) => {
    try {
      const res = await fetch(`${BASE_URL}/api/wms/alerts/${alertId}/ignore`, { method: 'POST' });
      const json = await res.json();
      if (json.code === 0 || json.success) {
        showToast('已忽略该预警', 'info');
        fetchAlerts();
        fetchPredictionDashboard();
      } else {
        showToast(json.message || json.error || '操作失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    }
  };

  /** 预测详情：点击预测型预警行 */
  const handlePredictionDetail = (alert: WmsAlert) => {
    setDetailAlert(alert);
    setDetailOpen(true);
  };

  /** 手动触发预测扫描 */
  const handleCheckPrediction = async () => {
    setChecking(true);
    try {
      const res = await fetch(`${BASE_URL}/api/wms/alerts/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includePrediction: true }),
      });
      const json = await res.json();
      if (json.code === 0 || json.success) {
        const data = json.data;
        const shortage = data?.predictedShortageAlerts ?? 0;
        const overstock = data?.predictedOverstockAlerts ?? 0;
        showToast(`AI 预测完成：${shortage} 条短缺、${overstock} 条积压`, 'success');
        fetchAlerts();
        fetchPredictionDashboard();
      } else {
        showToast(json.message || '预测失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    } finally {
      setChecking(false);
    }
  };

  // 过滤：状态 + 预警类型
  const filteredAlerts = alerts.filter((a) => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    if (filterAlertType !== 'all' && a.alertType !== filterAlertType) return false;
    return true;
  });

  const activeCount = alerts.filter((a) => a.status === 'active').length;

  return (
    <Box>
      <PageHeader
        title="异常预警"
        subtitle="低库存、临期、滞销、预测短缺/积压等异常情况的自动预警"
        summary={activeCount > 0 ? `当前 ${activeCount} 条活跃预警` : '暂无活跃预警'}
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>状态筛选</InputLabel>
              <Select
                value={filterStatus}
                label="状态筛选"
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <MenuItem value="all">全部</MenuItem>
                <MenuItem value="active">活跃</MenuItem>
                <MenuItem value="resolved">已解决</MenuItem>
                <MenuItem value="ignored">已忽略</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>预警类型</InputLabel>
              <Select
                value={filterAlertType}
                label="预警类型"
                onChange={(e) => setFilterAlertType(e.target.value)}
              >
                <MenuItem value="all">全部类型</MenuItem>
                <MenuItem value="low_stock">低库存</MenuItem>
                <MenuItem value="expiry">临期</MenuItem>
                <MenuItem value="stagnant">滞销</MenuItem>
                <MenuItem value="predicted_shortage">预测短缺</MenuItem>
                <MenuItem value="predicted_overstock">预测积压</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="contained"
              size="small"
              startIcon={checking ? <CircularProgress size={16} color="inherit" /> : <NotificationsActiveIcon sx={{ fontSize: 16 }} />}
              onClick={handleCheck}
              disabled={checking}
              sx={{
                textTransform: 'none',
                borderRadius: '8px',
                fontSize: '0.8125rem',
                backgroundColor: '#DC2626',
                '&:hover': { backgroundColor: '#B91C1C' },
              }}
            >
              {checking ? '检查中...' : '手动检查'}
            </Button>
            {activeCount > 0 && (
              <>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<CheckCircleOutlineIcon sx={{ fontSize: 16 }} />}
                  onClick={async () => {
                    const activeAlerts = alerts.filter((a) => a.status === 'active');
                    for (const alert of activeAlerts) {
                      if (alert.id !== undefined) await handleResolve(alert.id);
                    }
                  }}
                  sx={{
                    textTransform: 'none',
                    borderRadius: '8px',
                    fontSize: '0.8125rem',
                    borderColor: '#059669',
                    color: '#059669',
                    '&:hover': { borderColor: '#047857', backgroundColor: '#ECFDF5' },
                  }}
                >
                  全部解决
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<RemoveCircleOutlineIcon sx={{ fontSize: 16 }} />}
                  onClick={async () => {
                    const activeAlerts = alerts.filter((a) => a.status === 'active');
                    for (const alert of activeAlerts) {
                      if (alert.id !== undefined) await handleIgnore(alert.id);
                    }
                  }}
                  sx={{
                    textTransform: 'none',
                    borderRadius: '8px',
                    fontSize: '0.8125rem',
                    borderColor: '#E5E7EB',
                    color: '#6B7280',
                    '&:hover': { borderColor: '#9CA3AF', backgroundColor: '#F9FAFB' },
                  }}
                >
                  全部忽略
                </Button>
              </>
            )}
          </Box>
        }
      />

      {/* 智能预测看板 */}
      <WmsPredictionDashboard
        data={predictionData}
        loading={predictionLoading}
        onCheckPrediction={handleCheckPrediction}
        checking={checking}
      />

      <WmsAlertList
        alerts={filteredAlerts}
        loading={loading}
        onResolve={handleResolve}
        onIgnore={handleIgnore}
        onPredictionDetail={handlePredictionDetail}
      />

      {/* 预测详情抽屉 */}
      {detailAlert && (
        <WmsPredictionDetail
          open={detailOpen}
          onClose={() => {
            setDetailOpen(false);
            setDetailAlert(null);
          }}
          sku={detailAlert.sku || ''}
          warehouseId={detailAlert.warehouseId}
          alert={detailAlert}
          onResolve={handleResolve}
          onIgnore={handleIgnore}
        />
      )}
    </Box>
  );
};

export default WmsAlertPage;
