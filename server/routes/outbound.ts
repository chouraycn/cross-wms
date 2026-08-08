/**
 * Outbound Records Routes
 *
 * POST uses InventoryService.createOutbound() for transactional inventory deduction.
 * GET supports optional startDate/endDate/warehouseId query filters.
 * Returns { code: 400, message: '库存不足' } when stock is insufficient.
 */
import { Router, type Request, type Response } from 'express';
import {
  getOutboundRecords as dbGetAll,
  getOutboundRecordById as dbGetById,
  updateOutboundRecord as dbUpdate,
  deleteOutboundRecord as dbDelete,
} from '../dao/warehouse.js';
import * as InventoryService from '../services/inventoryService.js';
import { ok, created, fail, notFound, BizCode } from './_shared/respond.js';

const router = Router();

// GET /api/outbound-records?warehouseId=xxx&startDate=2026-01-01&endDate=2026-05-25
router.get('/', (req: Request, res: Response) => {
  const warehouseId = req.query.warehouseId as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const data = dbGetAll(warehouseId, startDate, endDate);
  return ok(res, data);
});

// GET /api/outbound-records/:id
router.get('/:id', (req: Request, res: Response) => {
  const data = dbGetById(req.params.id);
  if (!data) {
    return notFound(res, 'Outbound record not found');
  }
  return ok(res, data);
});

// POST /api/outbound-records — Transactional outbound with inventory deduction
router.post('/', (req: Request, res: Response) => {
  try {
    const result = InventoryService.createOutbound(req.body);
    return created(res, result);
  } catch (e) {
    const message = (e as Error).message;
    if (message === '库存不足') {
      return fail(res, BizCode.BAD_REQUEST, '库存不足', 400);
    }
    return fail(res, BizCode.BAD_REQUEST, message, 400);
  }
});

// PUT /api/outbound-records/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const data = dbUpdate(req.params.id, req.body);
    if (!data) {
      return notFound(res, 'Outbound record not found');
    }
    return ok(res, data);
  } catch (e) {
    return fail(res, BizCode.BAD_REQUEST, (e as Error).message, 400);
  }
});

// DELETE /api/outbound-records/:id
router.delete('/:id', (req: Request, res: Response) => {
  const deleted = dbDelete(req.params.id);
  if (!deleted) {
    return notFound(res, 'Outbound record not found');
  }
  return ok(res, null);
});

export default router;
