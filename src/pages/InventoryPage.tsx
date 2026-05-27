import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import InventoryList from '../components/Inventory/InventoryList';
import { subscribeRefresh } from '../App';

const InventoryPage: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const unsub = subscribeRefresh('inventory', handleRefresh);
    return unsub;
  }, [handleRefresh]);

  return (
    <Box key={refreshKey} className="page-fade-in">
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, color: '#111827' }}>
        库存管理
      </Typography>
      <InventoryList />
    </Box>
  );
};

export default InventoryPage;
