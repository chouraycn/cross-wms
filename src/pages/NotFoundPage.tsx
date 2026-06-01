import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';

/** 404 页面 — 路由未匹配时显示 */
const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 2,
      }}
    >
      <Typography
        sx={{
          fontSize: '4rem',
          fontWeight: 800,
          color: '#111827',
          lineHeight: 1,
        }}
      >
        404
      </Typography>
      <Typography
        sx={{
          fontSize: '1.125rem',
          color: '#6B7280',
          fontWeight: 400,
        }}
      >
        页面不存在
      </Typography>
      <Button
        variant="outlined"
        startIcon={<HomeOutlinedIcon />}
        onClick={() => navigate('/')}
        sx={{
          mt: 1,
          borderColor: '#E5E7EB',
          color: '#374151',
          '&:hover': {
            borderColor: '#111827',
            backgroundColor: '#F9FAFB',
          },
        }}
      >
        返回首页
      </Button>
    </Box>
  );
};

export default NotFoundPage;
