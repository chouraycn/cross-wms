import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Box, Typography } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

interface SortableWidgetProps {
  id: string;
  label: string;
  children: React.ReactNode;
}

const SortableWidget: React.FC<SortableWidgetProps> = ({ id, label, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : 'auto' as any,
    position: 'relative' as const,
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{ mb: 4, position: 'relative' }}
      className="dashboard-widget"
    >
      {/* 拖拽手柄 - 左侧显示，避免与右侧下载按钮重叠 */}
      <Box
        {...listeners}
        {...attributes}
        sx={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 10,
          p: 0.5,
          borderRadius: 1,
          cursor: 'grab',
          bgcolor: 'rgba(0,0,0,0.04)',
          border: '1px solid #E5E7EB',
          display: 'none',
          '.dashboard-widget:hover &': { display: 'flex' },
          alignItems: 'center',
          gap: 0.5,
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <DragIndicatorIcon fontSize="small" sx={{ color: '#9CA3AF', fontSize: 16 }} />
        <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>{label}</Typography>
      </Box>
      {children}
    </Box>
  );
};

export default SortableWidget;
