/**
 * 空仓库引导页 — 仪表盘和仓库管理共用
 * 统一空状态 UI，避免两套代码
 */
import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';

interface EmptyWarehouseStateProps {
  /** 点击"新建仓库"按钮的回调 */
  onAddWarehouse: () => void;
}

const EmptyWarehouseState: React.FC<EmptyWarehouseStateProps> = ({ onAddWarehouse }) => {
  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 8,
        px: 3,
        minHeight: 460,
        backgroundColor: '#FAFBFC',
        overflow: 'hidden',
      }}
    >
      {/* Dot grid pattern background */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          opacity: 0.35,
          backgroundImage: 'radial-gradient(circle, #D1D5DB 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      {/* Illustration */}
      <Box sx={{ mb: 5, position: 'relative', zIndex: 1 }}>
        <svg
          width="260"
          height="180"
          viewBox="0 0 260 180"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Ground shadow plane */}
          <polygon points="60,145 195,145 215,155 30,155" fill="#E5E7EB" opacity="0.5" />
          <polygon points="70,140 185,140 200,148 45,148" fill="#EEF0F2" opacity="0.6" />

          {/* Building 1 — Tall warehouse */}
          <polygon points="90,130 20,95 20,45 90,80" fill="#F3F4F6" />
          <polygon points="90,130 160,95 160,45 90,80" fill="#E5E7EB" />
          <polygon points="90,80 160,45 90,10 20,45" fill="#D1D5DB" />
          <line x1="90" y1="130" x2="90" y2="80" stroke="#D1D5DB" strokeWidth="1" />
          <line x1="20" y1="95" x2="20" y2="45" stroke="#CDD2D8" strokeWidth="1" />
          <line x1="160" y1="95" x2="160" y2="45" stroke="#CDD2D8" strokeWidth="1" />
          <rect x="105" y="83" width="38" height="24" rx="2" fill="#D5D9DF" />
          <line x1="105" y1="89" x2="143" y2="89" stroke="#C5CAD1" strokeWidth="0.7" />
          <line x1="105" y1="95" x2="143" y2="95" stroke="#C5CAD1" strokeWidth="0.7" />
          <line x1="105" y1="101" x2="143" y2="101" stroke="#C5CAD1" strokeWidth="0.7" />
          <rect x="45" y="68" width="8" height="8" rx="1" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth="0.5" />
          <rect x="58" y="62" width="8" height="8" rx="1" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth="0.5" />
          <rect x="45" y="80" width="8" height="8" rx="1" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth="0.5" />
          <rect x="58" y="73" width="8" height="8" rx="1" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth="0.5" />
          <line x1="55" y1="27.5" x2="125" y2="62.5" stroke="#C5CAD1" strokeWidth="0.7" />

          {/* Building 2 — Wide warehouse */}
          <polygon points="175,120 115,90 115,50 175,80" fill="#F9FAFB" />
          <polygon points="175,120 220,97.5 220,57.5 175,80" fill="#EEF0F2" />
          <polygon points="175,80 220,57.5 160,27.5 115,50" fill="#DDDFE3" />
          <line x1="175" y1="120" x2="175" y2="80" stroke="#D1D5DB" strokeWidth="1.2" />
          <rect x="152" y="85" width="40" height="20" rx="2" fill="#DDDFE3" />
          <line x1="152" y1="89.5" x2="192" y2="89.5" stroke="#CDD2D8" strokeWidth="0.7" />
          <line x1="152" y1="94" x2="192" y2="94" stroke="#CDD2D8" strokeWidth="0.7" />
          <line x1="152" y1="98.5" x2="192" y2="98.5" stroke="#CDD2D8" strokeWidth="0.7" />
          <rect x="190" y="70" width="12" height="8" rx="1" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth="0.5" />
          <line x1="137.5" y1="38.75" x2="190" y2="65" stroke="#CED1D7" strokeWidth="0.6" strokeDasharray="4 3" />

          {/* Building 3 — Small warehouse */}
          <polygon points="60,110 15,87.5 15,52.5 60,75" fill="#F9FAFB" />
          <polygon points="60,110 95,92.5 95,57.5 60,75" fill="#EEF0F2" />
          <polygon points="60,75 95,57.5 50,35 15,52.5" fill="#DDDFE3" />
          <line x1="60" y1="110" x2="60" y2="75" stroke="#D1D5DB" strokeWidth="1.2" />
          <rect x="72" y="83" width="16" height="16" rx="1.5" fill="#DDDFE3" />
          <line x1="72" y1="88" x2="88" y2="88" stroke="#CDD2D8" strokeWidth="0.7" />
          <line x1="72" y1="93" x2="88" y2="93" stroke="#CDD2D8" strokeWidth="0.7" />

          {/* Shipping container */}
          <polygon points="210,118 236,105 236,93 210,106" fill="#F9FAFB" />
          <polygon points="236,105 248,99 248,87 236,93" fill="#EEF0F2" />
          <polygon points="210,106 236,93 248,87 222,100" fill="#DDDFE3" />
          <line x1="221" y1="98" x2="233" y2="92" stroke="#D1D5DB" strokeWidth="0.6" />
          <line x1="225" y1="96" x2="237" y2="90" stroke="#D1D5DB" strokeWidth="0.6" />

          {/* Accent: floating "+" hint */}
          <circle cx="232" cy="72" r="9" fill="#111827" opacity="0.08" />
          <circle cx="232" cy="72" r="6" fill="#111827" opacity="0.12" />
          <rect x="228" y="70" width="8" height="1.8" rx="0.9" fill="#111827" opacity="0.35" />
          <rect x="231.1" y="67" width="1.8" height="8" rx="0.9" fill="#111827" opacity="0.35" />

          {/* Subtle ground line */}
          <line x1="8" y1="148" x2="252" y2="148" stroke="#E5E7EB" strokeWidth="1" />
        </svg>
      </Box>

      {/* Heading */}
      <Typography
        sx={{
          fontSize: '1.125rem',
          fontWeight: 600,
          color: '#1F2937',
          mb: 1,
          letterSpacing: '-0.015em',
          position: 'relative',
          zIndex: 1,
        }}
      >
        暂无仓库
      </Typography>

      {/* Description */}
      <Typography
        sx={{
          fontSize: '0.8125rem',
          color: '#9CA3AF',
          mb: 3.5,
          maxWidth: 300,
          textAlign: 'center',
          lineHeight: 1.65,
          position: 'relative',
          zIndex: 1,
        }}
      >
        添加第一个仓库，开始管理跨境仓储与库存数据
      </Typography>

      {/* CTA Button */}
      <Box sx={{ display: 'flex', gap: 1.5, position: 'relative', zIndex: 1 }}>
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
    </Box>
  );
};

export default EmptyWarehouseState;
