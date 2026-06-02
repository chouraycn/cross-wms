/**
 * 空仓库引导页 — 仪表盘风格
 * 统一空状态 UI，仪表盘和仓库管理共用
 */
import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';

interface EmptyWarehouseStateProps {
  /** 点击"新建仓库"按钮的回调 */
  onAddWarehouse: () => void;
}

const EmptyWarehouseState: React.FC<EmptyWarehouseStateProps> = ({ onAddWarehouse }) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 10,
        px: 3,
      }}
    >
      <WarehouseOutlinedIcon
        sx={{
          fontSize: 56,
          color: '#D1D5DB',
          mb: 2,
        }}
      />
      <Typography
        sx={{
          fontSize: '1rem',
          fontWeight: 500,
          color: '#6B7280',
          mb: 1,
        }}
      >
        暂无仓库数据
      </Typography>
      <Typography
        sx={{
          fontSize: '0.8125rem',
          color: '#9CA3AF',
          mb: 3,
          maxWidth: 280,
          textAlign: 'center',
          lineHeight: 1.6,
        }}
      >
        添加第一个仓库，开始管理跨境仓储与库存数据
      </Typography>
      <Button
        variant="contained"
        startIcon={<AddOutlinedIcon />}
        onClick={onAddWarehouse}
        sx={{
          backgroundColor: '#111827',
          color: '#FFFFFF',
          fontWeight: 600,
          fontSize: '0.8125rem',
          px: 3,
          py: 1,
          '&:hover': { backgroundColor: '#1F2937' },
        }}
      >
        新建仓库
      </Button>
    </Box>
  );
};

export default EmptyWarehouseState;
