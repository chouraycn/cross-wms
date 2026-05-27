import React from 'react';
import { Box, Typography } from '@mui/material';
import TencentDocsPanel from '../components/TencentDocs/TencentDocsPanel';

const TencentDocsPage: React.FC = () => {
  return (
    <Box className="page-fade-in">
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, color: '#111827' }}>
        腾讯文档集成
      </Typography>
      <TencentDocsPanel />
    </Box>
  );
};

export default TencentDocsPage;
