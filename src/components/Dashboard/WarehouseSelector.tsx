import React, { useState, useRef, useEffect, useCallback } from 'react';
import { IconButton, Popover, List, ListItemButton, ListItemText, ListItemIcon, Typography, Box, Button, Grow, Divider } from '@mui/material';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import CheckIcon from '@mui/icons-material/Check';
import { subscribeWarehouses } from '../../capabilities/warehouse';
import { emitNewWarehouse } from '../../App';
import { useNavigate } from 'react-router-dom';
import type { Warehouse } from '../../types';

export const ALL_WAREHOUSES = '__all__';

interface WarehouseSelectorProps {
  selected: string;
  onChange: (warehouseId: string) => void;
}

const WarehouseSelector: React.FC<WarehouseSelectorProps> = ({ selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  // 订阅全局仓库数据
  useEffect(() => {
    const unsub = subscribeWarehouses(setWarehouses);
    return unsub;
  }, []);

  // 点击「添加仓库」→ 先导航到仓库管理页，再延迟触发新建对话框
  const handleAddWarehouse = useCallback(() => {
    navigate('/warehouses');
    requestAnimationFrame(() => {
      emitNewWarehouse();
    });
  }, [navigate]);

  const options = [
    { id: ALL_WAREHOUSES, name: '全部仓库' },
    ...warehouses.map((w) => ({ id: w.id, name: w.name })),
  ];

  const selectedName = options.find((o) => o.id === selected)?.name ?? '全部仓库';
  const hasWarehouses = warehouses.length > 0;

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  // 没有仓库时，切换按钮变为「添加仓库」按钮
  if (!hasWarehouses) {
    return (
      <IconButton
        onClick={handleAddWarehouse}
        size="small"
        sx={{
          color: '#6B7280',
          borderRadius: '6px',
          '&:hover': { backgroundColor: 'rgba(0,0,0,0.06)' },
        }}
      >
        <AddOutlinedIcon fontSize="small" />
      </IconButton>
    );
  }

  return (
    <>
      <IconButton
        ref={anchorRef}
        onClick={() => setOpen(true)}
        size="small"
        sx={{
          color: '#6B7280',
          borderRadius: '6px',
          '&:hover': { backgroundColor: 'rgba(0,0,0,0.06)' },
        }}
      >
        <WarehouseOutlinedIcon fontSize="small" />
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
              border: '1px solid #E5E7EB',
              minWidth: 180,
              mt: 0.5,
              py: 0.5,
              overflow: 'hidden',
            },
          },
        }}
        TransitionComponent={Grow}
        TransitionProps={{ timeout: 200 }}
      >
        <Box sx={{ px: 2, pt: 1.5, pb: 0.75 }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            切换仓库
          </Typography>
        </Box>
        <List dense disablePadding>
          {options.map((opt) => {
            const isSelected = selected === opt.id;
            return (
              <ListItemButton
                key={opt.id}
                onClick={() => handleSelect(opt.id)}
                sx={{
                  py: 0.75,
                  px: 2,
                  '&:hover': { backgroundColor: '#F3F4F6' },
                }}
              >
                <ListItemText
                  primary={opt.name}
                  primaryTypographyProps={{
                    fontSize: '0.8125rem',
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? '#111827' : '#374151',
                  }}
                />
                {isSelected && (
                  <CheckIcon sx={{ fontSize: 16, color: '#111827', ml: 1 }} />
                )}
              </ListItemButton>
            );
          })}
          {/* 新建仓库入口 */}
          <Box sx={{ px: 2, pt: 0.5, pb: 1 }}>
            <Divider sx={{ mb: 1 }} />
            <Button
              fullWidth
              size="small"
              variant="outlined"
              startIcon={<AddOutlinedIcon sx={{ fontSize: 16 }} />}
              onClick={handleAddWarehouse}
              sx={{
                borderColor: '#D1D5DB',
                color: '#374151',
                fontSize: '0.75rem',
                justifyContent: 'flex-start',
                textTransform: 'none',
                '&:hover': { borderColor: '#9CA3AF', backgroundColor: '#F9FAFB' },
              }}
            >
              新建仓库
            </Button>
          </Box>
        </List>
      </Popover>
    </>
  );
};

export default WarehouseSelector;
