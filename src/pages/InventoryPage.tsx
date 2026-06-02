import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Button, Tooltip } from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import InventoryList from '../components/Inventory/InventoryList';
import PageHeader from '../components/Common/PageHeader';
import { subscribeRefresh } from '../App';
import { getInventoryItems } from '../capabilities/warehouse';
import { exportToCsv } from '../utils/exportCsv';

const InventoryPage: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);

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

  return (
    <Box key={refreshKey} className="page-fade-in">
      <PageHeader
        title="库存管理"
        summary={summary}
        action={
          items.length > 0 ? (
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
                  borderColor: '#E5E7EB',
                  color: '#6B7280',
                  '&:hover': { borderColor: '#9CA3AF', backgroundColor: '#F9FAFB' },
                }}
              >
                导出
              </Button>
            </Tooltip>
          ) : undefined
        }
      />
      <InventoryList />
    </Box>
  );
};

export default InventoryPage;
