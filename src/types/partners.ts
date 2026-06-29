/**
 * Partner (供应商/客户) Type Definitions
 *
 * CDFKnow v1.4.0 — Unified partner management for suppliers and customers.
 */

/** Partner type discriminator */
export type PartnerType = 'supplier' | 'customer';

/** Full partner record (matches DB partners table) */
export interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  contact: string;
  phone: string;
  address: string;
  remark: string;
  created_at: string;
  updated_at: string;
}

/** Lightweight option for MUI Autocomplete */
export interface PartnerOption {
  id: string;
  name: string;
  type: PartnerType;
}

/** Quick-create request payload */
export interface QuickCreatePartnerPayload {
  name: string;
  type: PartnerType;
}

/** Paginated list response */
export interface PartnerListResponse {
  items: Partner[];
  total: number;
  page: number;
  pageSize: number;
}
