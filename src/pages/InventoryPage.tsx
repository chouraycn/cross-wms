import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Button, Tooltip, useTheme } from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
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

const InventoryPage: React.FC = () => {
  const theme = useTheme();
  const fadeCls = usePageFadeIn();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
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
    ? `总库存 ${items.length} 件${warningCount > 0 ? ` · 预警 ${warningCount} 件` : ''}`
    : undefined;

  const handleExport = () => {
    if (items.length === 0) return;
    const headers = ['SKU', '名称', '仓库ID', '数量', '总体积(m³)', '品类', '库龄预警', '入库日期'];
    const rows = items.map(i => [
      i.sku || '',
      i.name || '',
      i.warehouseId || '',
      String(i.quantity ?? ''),
      String(i.totalVolume ?? ''),
      i.category || '',
      i.isAgeWarning ? '预警' : '正常',
      i.inboundDate ? new Date(i.inboundDate).toLocaleDateString('zh-CN') : '',
    ]);
    exportToCsv('inventory.csv', headers, rows);
  };

  /** 入库/出库成功回调：刷新库存列表 */
  const handleOperationSuccess = useCallback(() => {
    handleRefresh();
  }, [handleRefresh]);

  return (
    <Box key={refreshKey} className={fadeCls}>
      <PageHeader
        title="库存管理"
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
              入库
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
              出库
            </Button>
            {items.length > 0 && (
              <Tooltip title="导出 CSV">
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
                  导出
                </Button>
              </Tooltip>
            )}
          </Box>
        }
      />
      <InventoryList />

      {/* 变动历史区域 */}
      <Box sx={{ mt: 4 }}>
        <PageHeader title="变动历史" subtitle="库存出入库记录" />
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
