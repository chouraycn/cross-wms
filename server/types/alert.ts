/**
 * Alert Types
 */

export type AlertType = 'low_stock' | 'out_of_stock' | 'expiry' | 'stagnant' | 'overstock';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Alert {
  id: number;
  alertType: AlertType;
  severity: AlertSeverity;
  sku: string;
  warehouseId: string;
  message: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
}
