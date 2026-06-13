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

const router = Router();

// GET /api/outbound-records?warehouseId=xxx&startDate=2026-01-01&endDate=2026-05-25
router.get('/', (req: Request, res: Response) => {
  const warehouseId = req.query.warehouseId as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const data = dbGetAll(warehouseId, startDate, endDate);
  res.json({ code: 0, data, message: 'ok' });
});

// GET /api/outbound-records/:id
router.get('/:id', (req: Request, res: Response) => {
  const data = dbGetById(req.params.id);
  if (!data) {
    res.status(404).json({ code: 404, data: null, message: 'Outbound record not found' });
    return;
  }
  res.json({ code: 0, data, message: 'ok' });
});

// POST /api/outbound-records — Transactional outbound with inventory deduction
router.post('/', (req: Request, res: Response) => {
  try {
    const result = InventoryService.createOutbound(req.body);
    res.status(201).json({ code: 0, data: result, message: 'ok' });
  } catch (e) {
    const message = (e as Error).message;
    if (message === '库存不足') {
      res.status(400).json({ code: 400, message: '库存不足' });
      return;
    }
    res.status(400).json({ code: 400, data: null, message });
  }
});

// PUT /api/outbound-records/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const data = dbUpdate(req.params.id, req.body);
    if (!data) {
      res.status(404).json({ code: 404, data: null, message: 'Outbound record not found' });
      return;
    }
    res.json({ code: 0, data, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// DELETE /api/outbound-records/:id
router.delete('/:id', (req: Request, res: Response) => {
  const ok = dbDelete(req.params.id);
  if (!ok) {
    res.status(404).json({ code: 404, data: null, message: 'Outbound record not found' });
    return;
  }
  res.json({ code: 0, data: null, message: 'ok' });
});

export default router;
