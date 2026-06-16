import React, { useState, useRef, useEffect, useCallback } from 'react';
import { IconButton, Popover, List, ListItemButton, ListItemText, Typography, Box, Button, Grow, Divider, useTheme } from '@mui/material';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import CheckIcon from '@mui/icons-material/Check';
import { subscribeWarehouses } from '../../capabilities/warehouse';
import { emitNewWarehouse } from '../../App';
import { useNavigate } from 'react-router-dom';
import { getGrayScale } from '../../constants/theme';
import type { Warehouse } from '../../types';

export const ALL_WAREHOUSES = '__all__';

interface WarehouseSelectorProps {
  selected: string;
  onChange: (warehouseId: string) => void;
}

const WarehouseSelector = React.memo<WarehouseSelectorProps>(function WarehouseSelector({ selected, onChange }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

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
          color: gs.textMuted,
          borderRadius: '6px',
          '&:hover': { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
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
          color: gs.textMuted,
          borderRadius: '6px',
          '&:hover': { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
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
              boxShadow: isDark
                ? '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)'
                : '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
              border: `1px solid ${gs.border}`,
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
          <Typography sx={{ fontSize: '0.75rem', color: gs.textDisabled, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                  '&:hover': { backgroundColor: gs.bgHover },
                }}
              >
                <ListItemText
                  primary={opt.name}
                  primaryTypographyProps={{
                    fontSize: '0.8125rem',
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? gs.textPrimary : gs.textSecondary,
                  }}
                />
                {isSelected && (
                  <CheckIcon sx={{ fontSize: 16, color: gs.textPrimary, ml: 1 }} />
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
                borderColor: gs.borderDarker,
                color: gs.textSecondary,
                fontSize: '0.75rem',
                justifyContent: 'flex-start',
                textTransform: 'none',
                '&:hover': { borderColor: gs.textDisabled, backgroundColor: gs.bgHover },
              }}
            >
              新建仓库
            </Button>
          </Box>
        </List>
      </Popover>
    </>
  );
});

export default WarehouseSelector;
