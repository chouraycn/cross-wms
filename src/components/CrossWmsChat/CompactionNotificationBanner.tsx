import React from 'react';
import { Box, Typography, Collapse, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CompressIcon from '@mui/icons-material/Compress';

interface CompactionNotificationBannerProps {
  notification: {
    id: string;
    message: string;
    tokensBefore?: number;
    tokensAfter?: number;
    reductionRatio?: number;
    summary?: string;
    timestamp: number;
    read: boolean;
  };
  onDismiss?: () => void;
}

const CompactionNotificationBanner: React.FC<CompactionNotificationBannerProps> = ({
  notification,
  onDismiss,
}) => {
  const [visible, setVisible] = React.useState(true);

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  const reductionPct = notification.reductionRatio
    ? Math.round(notification.reductionRatio * 100)
    : null;

  return (
    <Collapse in={visible}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          my: 0.5,
          borderRadius: '8px',
          bgcolor: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(59,130,246,0.15)',
        }}
      >
        <CompressIcon sx={{ fontSize: 16, color: '#3B82F6', flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, color: '#3B82F6', fontWeight: 500 }}>
            {notification.message}
          </Typography>
          {reductionPct !== null && notification.tokensBefore && notification.tokensAfter && (
            <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.25 }}>
              {notification.tokensBefore.toLocaleString()} tokens → {notification.tokensAfter.toLocaleString()} tokens (节省 {reductionPct}%)
            </Typography>
          )}
          {notification.summary && (
            <Typography
              sx={{
                fontSize: 11,
                color: 'text.secondary',
                mt: 0.25,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              摘要: {notification.summary}
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={handleDismiss} sx={{ p: 0.25 }}>
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
    </Collapse>
  );
};

export default CompactionNotificationBanner;
