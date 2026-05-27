import React from 'react';
import { Box } from '@mui/material';
import { useParams } from 'react-router-dom';
import WarehouseList from '../components/Warehouses/WarehouseList';
import WarehouseDetail from '../components/Warehouses/WarehouseDetail';

const WarehousesPage: React.FC = () => {
  const { warehouseId } = useParams<{ warehouseId?: string }>();

  return (
    <Box className="page-fade-in">
      {warehouseId ? (
        <WarehouseDetail warehouseId={warehouseId} />
      ) : (
        <WarehouseList />
      )}
    </Box>
  );
};

export default WarehousesPage;
