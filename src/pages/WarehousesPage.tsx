import React from 'react';
import { Box } from '@mui/material';
import { useParams } from 'react-router-dom';
import WarehouseList from '../components/Warehouses/WarehouseList';
import WarehouseDetail from '../components/Warehouses/WarehouseDetail';
import ErrorBoundary from '../components/Common/ErrorBoundary';
import { usePageFadeIn } from '../hooks/usePageFadeIn';

const WarehousesPage: React.FC = () => {
  const { warehouseId } = useParams<{ warehouseId?: string }>();
  const fadeCls = usePageFadeIn();

  return (
    <Box className={fadeCls}>
      {warehouseId ? (
        <ErrorBoundary>
          <WarehouseDetail warehouseId={warehouseId} />
        </ErrorBoundary>
      ) : (
        <ErrorBoundary>
          <WarehouseList />
        </ErrorBoundary>
      )}
    </Box>
  );
};

export default WarehousesPage;
