import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import TransitList from '../components/InTransit/TransitList';
import { subscribeRefresh } from '../App';

const InTransitPage: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const unsub = subscribeRefresh('in-transit', handleRefresh);
    return unsub;
  }, [handleRefresh]);

  return (
    <Box key={refreshKey} className="page-fade-in">
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, color: '#111827' }}>
        在途管理
      </Typography>
      <TransitList />
    </Box>
  );
};

export default InTransitPage;
