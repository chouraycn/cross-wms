import React, { lazy, Suspense, type ReactNode } from 'react';
import { Box, CircularProgress } from '@mui/material';
import type { TimeRange } from './TimeRangeSelector';

const LoadingFallback: React.FC<{ children?: ReactNode }> = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
    <CircularProgress size={32} />
  </Box>
);

export const LazyVolumeChart = lazy(() => import('./VolumeChart'));
export const LazyTransitPieChart = lazy(() => import('./TransitPieChart'));
export const LazyWarehouseBarChart = lazy(() => import('./WarehouseBarChart'));
export const LazyHeatmap = lazy(() => import('./heatmap'));
export const LazyTransitTimeChart = lazy(() => import('./TransitTimeChart'));

interface LazyChartProps {
  warehouseId: string;
  timeRange?: TimeRange;
}

export const VolumeChartLazy: React.FC<LazyChartProps> = (props) => (
  <Suspense fallback={<LoadingFallback />}>
    <LazyVolumeChart {...props} />
  </Suspense>
);

export const TransitPieChartLazy: React.FC<{ timeRange?: TimeRange }> = (props) => (
  <Suspense fallback={<LoadingFallback />}>
    <LazyTransitPieChart {...props} />
  </Suspense>
);

export const WarehouseBarChartLazy: React.FC<LazyChartProps> = (props) => (
  <Suspense fallback={<LoadingFallback />}>
    <LazyWarehouseBarChart {...props} />
  </Suspense>
);

export const HeatmapLazy: React.FC<LazyChartProps> = (props) => (
  <Suspense fallback={<LoadingFallback />}>
    <LazyHeatmap {...props} />
  </Suspense>
);

export const TransitTimeChartLazy: React.FC<LazyChartProps> = (props) => (
  <Suspense fallback={<LoadingFallback />}>
    <LazyTransitTimeChart {...props} />
  </Suspense>
);