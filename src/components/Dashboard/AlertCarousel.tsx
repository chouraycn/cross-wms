import React, { useState, useCallback } from 'react';
import { Box, Typography, Alert, IconButton, Paper } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

export interface DashboardAlert {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

interface AlertCarouselProps {
  alerts: DashboardAlert[];
  onDismiss: (alertId: string) => void;
}

export function AlertCarousel({ alerts, onDismiss }: AlertCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (alerts.length === 0) return null;

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? alerts.length - 1 : prev - 1));
  }, [alerts.length]);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === alerts.length - 1 ? 0 : prev + 1));
  }, [alerts.length]);

  const currentAlert = alerts[currentIndex];

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 2,
        borderRadius: 2,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: currentAlert.severity === 'error' ? '#FCA5A5' : 
                     currentAlert.severity === 'warning' ? '#FDE68A' : 
                     '#93C5FD',
      }}
    >
      <Alert
        severity={currentAlert.severity}
        sx={{
          borderRadius: 0,
          '& .MuiAlert-message': { flex: 1 },
        }}
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {alerts.length > 1 && (
              <>
                <IconButton size="small" onClick={goPrev} disabled={alerts.length <= 1}>
                  <ChevronLeftIcon fontSize="small" />
                </IconButton>
                <Typography variant="caption" sx={{ fontSize: '0.75rem', color: 'inherit', mx: 0.5 }}>
                  {currentIndex + 1} / {alerts.length}
                </Typography>
                <IconButton size="small" onClick={goNext} disabled={alerts.length <= 1}>
                  <ChevronRightIcon fontSize="small" />
                </IconButton>
              </>
            )}
            <IconButton
              size="small"
              onClick={() => onDismiss(currentAlert.id)}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        }
      >
        <Typography sx={{ fontWeight: 600 }}>{currentAlert.title}</Typography>
        <Typography sx={{ fontSize: '0.8125rem' }}>{currentAlert.message}</Typography>
      </Alert>
    </Paper>
  );
}
