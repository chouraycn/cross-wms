/**
 * 异常预警页面
 *
 * 查看预警列表、解决/忽略预警、手动触发预警检查。
 * API: GET /api/wms/alerts, POST /api/wms/alerts/check, POST /api/wms/alerts/:id/resolve, POST /api/wms/alerts/:id/ignore
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
import { subscribeRefresh } from '../App';
import { useToast } from '../contexts/ToastContext';
import type { WmsAlert } from '../types/wms';

const BASE_URL = 'http://localhost:3001';

const WmsAlertPage: React.FC = () => {
  const { showToast } = useToast();

  const [alerts, setAlerts] = useState<WmsAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('active');

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

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    const unsub = subscribeRefresh('wms-alerts', fetchAlerts);
    return unsub;
  }, [fetchAlerts]);

  /** 手动触发预警检查 */
  const handleCheck = async () => {
    setChecking(true);
    try {
      const res = await fetch(`${BASE_URL}/api/wms/alerts/check`, { method: 'POST' });
      const json = await res.json();
      if (json.code === 0 || json.success) {
        showToast(`预警检查完成，发现 ${json.data?.newAlerts ?? 0} 条新预警`, 'success');
        fetchAlerts();
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
      } else {
        showToast(json.message || json.error || '操作失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    }
  };

  const filteredAlerts = filterStatus === 'all'
    ? alerts
    : alerts.filter((a) => a.status === filterStatus);

  const activeCount = alerts.filter((a) => a.status === 'active').length;

  return (
    <Box>
      <PageHeader
        title="异常预警"
        subtitle="低库存、临期、滞销等异常情况的自动预警"
        summary={activeCount > 0 ? `当前 ${activeCount} 条活跃预警` : '暂无活跃预警'}
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
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

      <WmsAlertList
        alerts={filteredAlerts}
        loading={loading}
        onResolve={handleResolve}
        onIgnore={handleIgnore}
      />
    </Box>
  );
};

export default WmsAlertPage;
