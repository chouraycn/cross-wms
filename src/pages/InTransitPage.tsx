import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Button, Tooltip } from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import TransitList from '../components/InTransit/TransitList';
import PageHeader from '../components/Common/PageHeader';
import { subscribeRefresh } from '../App';
import { getTransitOrders } from '../capabilities/warehouse';
import { exportToCsv } from '../utils/exportCsv';
import { usePageFadeIn } from '../hooks/usePageFadeIn';
import { useI18n, getDateLocale } from '../components/staff/i18n/index.js';

const InTransitPage: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const fadeCls = usePageFadeIn();
  const { t } = useI18n();
  const dateLocale = getDateLocale();

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const unsub = subscribeRefresh('in-transit', handleRefresh);
    return unsub;
  }, [handleRefresh]);

  const orders = useMemo(() => getTransitOrders(), [refreshKey]);

  const summary = orders.length > 0 ? t('在途 {count} 单', { count: orders.length }) : undefined;

  const handleExport = () => {
    if (orders.length === 0) return;
    const headers = [
      t('订单号'), t('跟踪号'), t('品类'), t('重量(kg)'), t('体积(m³)'),
      t('运输方式'), t('状态'), t('承运商'), t('预计到港'),
    ];
    const rows = orders.map(o => [
      o.id || '',
      o.trackingNo || '',
      o.category || '',
      String(o.weight ?? ''),
      String(o.volume ?? ''),
      o.transportMode || '',
      o.status || '',
      o.carrier || '',
      o.estimatedArrival ? new Date(o.estimatedArrival).toLocaleDateString(dateLocale) : '',
    ]);
    exportToCsv('transit-orders.csv', headers, rows);
  };

  return (
    <Box key={refreshKey} className={fadeCls}>
      <PageHeader
        title={t('在途管理')}
        summary={summary}
        action={
          orders.length > 0 ? (
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
                  borderColor: '#E5E7EB',
                  color: '#6B7280',
                  '&:hover': { borderColor: '#9CA3AF', backgroundColor: '#F9FAFB' },
                }}
              >
                {t('导出')}
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
