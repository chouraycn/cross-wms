import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Button, Tooltip } from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import TransitList from '../components/InTransit/TransitList';
import PageHeader from '../components/Common/PageHeader';
import { subscribeRefresh } from '../App';
import { getTransitOrders } from '../stores/transitStore';
import { exportToCsv } from '../utils/exportCsv';

const InTransitPage: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const unsub = subscribeRefresh('in-transit', handleRefresh);
    return unsub;
  }, [handleRefresh]);

  const orders = useMemo(() => getTransitOrders(), [refreshKey]);

  const summary = orders.length > 0 ? `在途 ${orders.length} 单` : undefined;

  const handleExport = () => {
    if (orders.length === 0) return;
    const headers = ['订单号', '跟踪号', '品类', '重量(kg)', '体积(m³)', '运输方式', '状态', '承运商', '预计到港'];
    const rows = orders.map(o => [
      o.id || '',
      o.trackingNo || '',
      o.category || '',
      String(o.weight ?? ''),
      String(o.volume ?? ''),
      o.transportMode || '',
      o.status || '',
      o.carrier || '',
      o.estimatedArrival ? new Date(o.estimatedArrival).toLocaleDateString('zh-CN') : '',
    ]);
    exportToCsv('transit-orders.csv', headers, rows);
  };

  return (
    <Box key={refreshKey} className="page-fade-in">
      <PageHeader
        title="在途管理"
        summary={summary}
        action={
          orders.length > 0 ? (
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
      <TransitList />
    </Box>
  );
};

export default InTransitPage;
