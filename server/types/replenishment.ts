/**
 * Replenishment Types
 */

export interface ReplenishmentSuggestion {
  sku: string;
  name: string;
  warehouseId: string;
  warehouseName: string;
  currentStock: number;
  threshold: number;
  suggestedQuantity: number;
  unitPrice: number;
  estimatedCost: number;
  reason: string;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
}

export interface ReplenishmentRule {
  id: number;
  sku: string;
  warehouseId: string;
  minStock: number;
  maxStock: number | null;
  safetyDays: number;
  replenishMultiplier: number;
  supplierId: string | null;
  leadTimeDays: number | null;
  autoOrder: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}
