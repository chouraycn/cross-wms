/**
 * 智能补货建议页面
 *
 * 展示补货建议列表，支持生成建议、筛选、批量操作。
 * API: /api/wms/replenishment
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Tabs,
  Tab,
  CircularProgress,
  useTheme,
} from '@mui/material';
import { getGrayScale } from '../constants/theme';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import PageHeader from '../components/Common/PageHeader';
import WmsReplenishmentList from '../components/wms/WmsReplenishmentList';
import { subscribeRefresh } from '../App';
import { useToast } from '../contexts/ToastContext';
import {
  fetchReplenishmentSuggestions,
  generateReplenishmentSuggestions,
  updateSuggestionStatus,
} from '../api/replenishmentApi';
import type {
  ReplenishmentSuggestion,
  ReplenishmentFilter,
  ReplenishmentStats,
  ReplenishmentStatus,
} from '../types/wms';

const STATUS_TABS: { label: string; value: string }[] = [
  { label: '全部', value: 'all' },
  { label: '待处理', value: 'pending' },
  { label: '已确认', value: 'confirmed' },
  { label: '已忽略', value: 'ignored' },
  { label: '暂缓', value: 'deferred' },
];

const WmsReplenishmentPage: React.FC = () => {
  const { showToast } = useToast();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [data, setData] = useState<ReplenishmentSuggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [statusTab, setStatusTab] = useState(0);
  const [filterWarehouseId, setFilterWarehouseId] = useState<string>('');
  const [filterSku, setFilterSku] = useState<string>('');
  const [stats, setStats] = useState<ReplenishmentStats>({
    total: 0,
    pending: 0,
    critical: 0,
    totalInTransitQty: 0,
    todayConfirmed: 0,
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // ===================== 数据获取 =====================

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const currentPage = page + 1;
      const statusFilter = STATUS_TABS[statusTab].value === 'all'
        ? undefined
        : STATUS_TABS[statusTab].value as ReplenishmentStatus;

      const result = await fetchReplenishmentSuggestions({
        status: statusFilter,
        warehouseId: filterWarehouseId || undefined,
        sku: filterSku || undefined,
        page: currentPage,
        pageSize: rowsPerPage,
        includeStats: true,
      });
      setData(result.items || []);
      setTotal(result.total);
      if (result.stats) {
        setStats(result.stats);
      }
    } catch {
      showToast('获取数据失败', 'error');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [statusTab, filterWarehouseId, filterSku, page, rowsPerPage, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const unsub = subscribeRefresh('wms-replenishment', fetchData);
    return unsub;
  }, [fetchData]);

  // ===================== 操作处理 =====================

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateReplenishmentSuggestions();
      showToast(`已生成 ${result.created} 条补货建议`, 'success');
      setPage(0);
      fetchData();
    } catch (e) {
      showToast((e as Error).message || '生成失败', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleBatchIgnore = async () => {
    if (selectedIds.length === 0) {
      showToast('请先选择建议', 'warning');
      return;
    }
    try {
      let successCount = 0;
      for (const id of selectedIds) {
        const result = await updateSuggestionStatus(id, 'ignored');
        if (result) successCount++;
      }
      showToast(`已忽略 ${successCount} 条建议`, 'success');
      setSelectedIds([]);
      fetchData();
    } catch (e) {
      showToast((e as Error).message || '操作失败', 'error');
    }
  };

  const handleStatusTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setStatusTab(newValue);
    setPage(0);
    setSelectedIds([]);
  };

  // ===================== 统计卡片 =====================

  const statCards = [
    { label: '待处理', value: stats.pending, color: '#D97706', bgColor: '#FEF3C7' },
    { label: '紧急补货', value: stats.critical, color: '#DC2626', bgColor: '#FEE2E2' },
    { label: '在途冲抵总量', value: stats.totalInTransitQty, color: '#2563EB', bgColor: '#DBEAFE' },
    { label: '今日已确认', value: stats.todayConfirmed, color: '#059669', bgColor: '#D1FAE5' },
  ];

  return (
    <Box>
      <PageHeader
        title="补货建议"
        subtitle="基于 EMA 日均消耗 + 安全库存 + 在途冲抵的智能补货推荐"
        summary={`共 ${total} 条建议`}
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>仓库筛选</InputLabel>
              <Select
                value={filterWarehouseId}
                label="仓库筛选"
                onChange={(e) => { setFilterWarehouseId(e.target.value); setPage(0); }}
              >
                <MenuItem value="">全部仓库</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              placeholder="搜索 SKU"
              value={filterSku}
              onChange={(e) => setFilterSku(e.target.value)}
              sx={{ width: 140 }}
            />
            <Button
              variant="contained"
              size="small"
              startIcon={generating ? <CircularProgress size={16} color="inherit" /> : <AutorenewIcon sx={{ fontSize: 16 }} />}
              onClick={handleGenerate}
              disabled={generating}
              sx={{
                textTransform: 'none',
                borderRadius: '8px',
                fontSize: '0.8125rem',
                backgroundColor: gs.textPrimary,
                '&:hover': { backgroundColor: gs.textSecondary },
              }}
            >
              生成建议
            </Button>
          </Box>
        }
      />

      {/* 统计卡片 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {statCards.map((card) => (
          <Grid item xs={3} key={card.label}>
            <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, p: 2 }}>
              <Typography variant="body2" sx={{ color: gs.textMuted, fontSize: '0.75rem', mb: 0.5 }}>
                {card.label}
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: card.color }}>
                {card.value}
              </Typography>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* 状态 Tab */}
      <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, mb: 2 }}>
        <Tabs
          value={statusTab}
          onChange={handleStatusTabChange}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontSize: '0.8125rem' },
          }}
        >
          {STATUS_TABS.map((tab) => (
            <Tab key={tab.value} label={tab.label} />
          ))}
        </Tabs>
      </Card>

      {/* 数据表格 */}
      <WmsReplenishmentList
        items={data}
        total={total}
        page={page}
        rowsPerPage={rowsPerPage}
        loading={loading}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onRefresh={fetchData}
        onPageChange={(p) => setPage(p)}
        onRowsPerPageChange={(r) => { setRowsPerPage(r); setPage(0); }}
      />

      {/* 底部批量操作栏 */}
      {selectedIds.length > 0 && (
        <Card
          elevation={2}
          sx={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            px: 3,
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            borderRadius: 3,
            border: `1px solid ${gs.border}`,
          }}
        >
          <Typography variant="body2" sx={{ color: gs.textMuted }}>
            已选 {selectedIds.length} 项
          </Typography>
          <Button
            variant="outlined"
            size="small"
            color="inherit"
            onClick={handleBatchIgnore}
            sx={{ textTransform: 'none', fontSize: '0.8125rem' }}
          >
            批量忽略
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              setSelectedIds([]);
              showToast('已清除选择', 'info');
            }}
            sx={{ textTransform: 'none', fontSize: '0.8125rem' }}
          >
            取消选择
          </Button>
        </Card>
      )}
    </Box>
  );
};

export default WmsReplenishmentPage;
