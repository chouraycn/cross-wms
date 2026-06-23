/**
 * Inventory Types
 */

export interface InventoryItem {
  id: number;
  sku: string;
  name: string;
  warehouseId: string;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  totalVolume: number | null;
  location: string | null;
  expiryDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboundRecord {
  id: number;
  warehouseId: string;
  sku: string;
  quantity: number;
  operator: string;
  remarks: string | null;
  createdAt: string;
}

export interface OutboundRecord {
  id: number;
  warehouseId: string;
  sku: string;
  quantity: number;
  operator: string;
  remarks: string | null;
  createdAt: string;
}
