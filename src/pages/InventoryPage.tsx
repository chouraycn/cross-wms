import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Tooltip, useTheme } from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import InventoryList from '../components/Inventory/InventoryList';
import InboundDialog from '../components/Inventory/InboundDialog';
import OutboundDialog from '../components/Inventory/OutboundDialog';
import TransactionHistory from '../components/Inventory/TransactionHistory';
import PageHeader from '../components/Common/PageHeader';
import { subscribeRefresh } from '../App';
import { getInventoryItems } from '../capabilities/warehouse';
import { exportToCsv } from '../utils/exportCsv';
import { getGrayScale } from '../constants/theme';
import { usePageFadeIn } from '../hooks/usePageFadeIn';
import { useI18n, getDateLocale } from '../components/staff/i18n/index.js';

const InventoryPage: React.FC = () => {
  const theme = useTheme();
  const fadeCls = usePageFadeIn();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { t } = useI18n();
  const dateLocale = getDateLocale();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [inboundOpen, setInboundOpen] = useState(false);
  const [outboundOpen, setOutboundOpen] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const unsub = subscribeRefresh('inventory', handleRefresh);
    return unsub;
  }, [handleRefresh]);

  const items = useMemo(() => getInventoryItems(), [refreshKey]);

  const warningCount = items.filter(i => i.isAgeWarning).length;

  const summary = items.length > 0
    ? (warningCount > 0
        ? t('总库存 {total} 件 · 预警 {warning} 件', { total: items.length, warning: warningCount })
        : t('总库存 {total} 件', { total: items.length }))
    : undefined;

  const handleExport = () => {
    if (items.length === 0) return;
    const headers = ['SKU', t('名称'), t('仓库ID'), t('数量'), t('总体积(m³)'), t('品类'), t('库龄预警'), t('入库日期')];
    const rows = items.map(i => [
      i.sku || '',
      i.name || '',
      i.warehouseId || '',
      String(i.quantity ?? ''),
      String(i.totalVolume ?? ''),
      i.category || '',
      i.isAgeWarning ? t('预警') : t('正常'),
      i.inboundDate ? new Date(i.inboundDate).toLocaleDateString(dateLocale) : '',
    ]);
    exportToCsv('inventory.csv', headers, rows);
  };

  /** 入库/出库成功回调：刷新库存列表 */
  const handleOperationSuccess = useCallback(() => {
    handleRefresh();
  }, [handleRefresh]);

  /** 让仓库专员帮我查：将当前库存概况注入 AI 对话 */
  const handleAskWarehouseAgent = useCallback(() => {
    const parts: string[] = [`当前库存共 ${items.length} 件 SKU`];
    if (warningCount > 0) parts.push(`库龄预警 ${warningCount} 件`);
    const prompt = `帮我分析当前库存情况：${parts.join('，')}。请重点排查预警商品，给出补货或清理建议，并按品类汇总库存分布。`;
    try {
      sessionStorage.setItem('cdf-chat-prefill', prompt);
    } catch { /* ignore */ }
    navigate('/chat');
  }, [items.length, warningCount, navigate]);

  return (
    <Box key={refreshKey} className={fadeCls}>
      <PageHeader
        title={t('库存管理')}
        summary={summary}
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddCircleOutlineIcon sx={{ fontSize: 16 }} />}
              onClick={() => setInboundOpen(true)}
              sx={{
                textTransform: 'none',
                borderRadius: '8px',
                fontSize: '0.8125rem',
                backgroundColor: '#111827',
                '&:hover': { backgroundColor: '#374151' },
              }}
            >
              {t('入库')}
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<RemoveCircleOutlineIcon sx={{ fontSize: 16 }} />}
              onClick={() => setOutboundOpen(true)}
              sx={{
                textTransform: 'none',
                borderRadius: '8px',
                fontSize: '0.8125rem',
                borderColor: gs.border,
                color: gs.textSecondary,
                '&:hover': { borderColor: gs.textDisabled, backgroundColor: gs.bgPage },
              }}
            >
              {t('出库')}
            </Button>
            {items.length > 0 && (
              <Tooltip title={t('导出 CSV')}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<FileDownloadIcon sx={{ fontSize: 16 }} />}
                  onClick={handleExport}
                  sx={{
                    textTransform: 'none',
                    borderRadius: '8px',
                    fontSize: '0.8125rem',
                    borderColor: gs.border,
                    color: gs.textMuted,
                    '&:hover': { borderColor: gs.textDisabled, backgroundColor: gs.bgPage },
                  }}
                >
                  {t('导出')}
                </Button>
              </Tooltip>
            )}
            {items.length > 0 && (
              <Tooltip title={t('让仓库专员帮我分析库存')}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<SupportAgentIcon sx={{ fontSize: 16 }} />}
                  onClick={handleAskWarehouseAgent}
                  sx={{
                    textTransform: 'none',
                    borderRadius: '8px',
                    fontSize: '0.8125rem',
                    borderColor: '#2563EB',
                    color: '#2563EB',
                    '&:hover': { borderColor: '#1D4ED8', backgroundColor: '#EFF6FF' },
                  }}
                >
                  {t('让仓库专员帮我查')}
                </Button>
              </Tooltip>
            )}
          </Box>
        }
      />
      <InventoryList />

      {/* 变动历史区域 */}
      <Box sx={{ mt: 4 }}>
        <PageHeader title={t('变动历史')} subtitle={t('库存出入库记录')} />
        <TransactionHistory />
      </Box>

      {/* 入库弹窗 */}
      <InboundDialog
        open={inboundOpen}
        onClose={() => setInboundOpen(false)}
        onSuccess={handleOperationSuccess}
      />

      {/* 出库弹窗 */}
      <OutboundDialog
        open={outboundOpen}
        onClose={() => setOutboundOpen(false)}
        onSuccess={handleOperationSuccess}
      />
    </Box>
  );
};

export default InventoryPage;
