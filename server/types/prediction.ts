/**
 * Prediction Types
 */

export type ForecastPeriod = 'daily' | 'weekly' | 'monthly';

export interface DemandForecast {
  id: number;
  sku: string;
  warehouseId: string;
  forecastDate: string;
  forecastDays: number;
  predictedDemand: number;
  confidenceLevel: number;
  modelVersion: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  details?: {
    dailyForecasts: Array<{ date: string; predictedDemand: number; confidence: number }>;
    avgDailyDemand: number;
    trend: number;
    historyDays: number;
  };
}
