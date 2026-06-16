/**
 * 统一页面标题组件
 * 所有页面应使用此组件保持标题样式一致
 */

import React from 'react';
import { Box, Typography } from '@mui/material';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  summary?: string;
  action?: React.ReactNode;
}

const PageHeader = React.memo<PageHeaderProps>(function PageHeader({ title, subtitle, summary, action }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 0.5 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography sx={{ fontSize: '0.875rem', color: '#6B7280' }}>
              {subtitle}
            </Typography>
          )}
          {summary && (
            <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF', mt: 0.5 }}>
              {summary}
            </Typography>
          )}
        </Box>
        {action && <Box sx={{ flexShrink: 0, ml: 2 }}>{action}</Box>}
      </Box>
    </Box>
  );
});

export default PageHeader;
