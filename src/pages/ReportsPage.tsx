import React, { useState, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';
import ReportsPanel from '../components/Reports/ReportsPanel';
import PageHeader from '../components/Common/PageHeader';
import { subscribeRefresh } from '../App';
import { usePageFadeIn } from '../hooks/usePageFadeIn';

const ReportsPage: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const fadeCls = usePageFadeIn();

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const unsub = subscribeRefresh('reports', handleRefresh);
    return unsub;
  }, [handleRefresh]);

  return (
    <Box key={refreshKey} className={fadeCls}>
      <PageHeader title="统计报表" subtitle="仓库运营数据报表与趋势分析" />
      <ReportsPanel />
    </Box>
  );
};

export default ReportsPage;
