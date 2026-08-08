/**
 * Inbound Records Routes
 *
 * POST uses InventoryService.createInbound() for transactional inventory updates.
 * GET supports optional startDate/endDate/warehouseId query filters.
 */
import { Router, type Request, type Response } from 'express';
import {
  getInboundRecords as dbGetAll,
  getInboundRecordById as dbGetById,
  updateInboundRecord as dbUpdate,
  deleteInboundRecord as dbDelete,
} from '../dao/warehouse.js';
import * as InventoryService from '../services/inventoryService.js';
import { ok, created, fail, notFound, BizCode } from './_shared/respond.js';

const router = Router();

// GET /api/inbound-records?warehouseId=xxx&startDate=2026-01-01&endDate=2026-05-25
router.get('/', (req: Request, res: Response) => {
  const warehouseId = req.query.warehouseId as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const data = dbGetAll(warehouseId, startDate, endDate);
  return ok(res, data);
});

// GET /api/inbound-records/:id
router.get('/:id', (req: Request, res: Response) => {
  const data = dbGetById(req.params.id);
  if (!data) {
    return notFound(res, 'Inbound record not found');
  }
  return ok(res, data);
});

// POST /api/inbound-records — Transactional inbound with inventory update
router.post('/', (req: Request, res: Response) => {
  try {
    const result = InventoryService.createInbound(req.body);
    return created(res, result);
  } catch (e) {
    const message = (e as Error).message;
    return fail(res, BizCode.BAD_REQUEST, message, 400);
  }
});

// PUT /api/inbound-records/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const data = dbUpdate(req.params.id, req.body);
    if (!data) {
      return notFound(res, 'Inbound record not found');
    }
    return ok(res, data);
  } catch (e) {
    return fail(res, BizCode.BAD_REQUEST, (e as Error).message, 400);
  }
});

// DELETE /api/inbound-records/:id
router.delete('/:id', (req: Request, res: Response) => {
  const deleted = dbDelete(req.params.id);
  if (!deleted) {
    return notFound(res, 'Inbound record not found');
  }
  return ok(res, null);
});

export default router;
