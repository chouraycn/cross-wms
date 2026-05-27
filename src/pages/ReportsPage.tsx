import React, { useState, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';
import ReportsPanel from '../components/Reports/ReportsPanel';
import { subscribeRefresh } from '../App';

const ReportsPage: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const unsub = subscribeRefresh('reports', handleRefresh);
    return unsub;
  }, [handleRefresh]);

  return (
    <Box key={refreshKey} className="page-fade-in">
      <ReportsPanel />
    </Box>
  );
};

export default ReportsPage;
