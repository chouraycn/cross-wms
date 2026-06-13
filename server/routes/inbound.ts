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

const router = Router();

// GET /api/inbound-records?warehouseId=xxx&startDate=2026-01-01&endDate=2026-05-25
router.get('/', (req: Request, res: Response) => {
  const warehouseId = req.query.warehouseId as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const data = dbGetAll(warehouseId, startDate, endDate);
  res.json({ code: 0, data, message: 'ok' });
});

// GET /api/inbound-records/:id
router.get('/:id', (req: Request, res: Response) => {
  const data = dbGetById(req.params.id);
  if (!data) {
    res.status(404).json({ code: 404, data: null, message: 'Inbound record not found' });
    return;
  }
  res.json({ code: 0, data, message: 'ok' });
});

// POST /api/inbound-records — Transactional inbound with inventory update
router.post('/', (req: Request, res: Response) => {
  try {
    const result = InventoryService.createInbound(req.body);
    res.status(201).json({ code: 0, data: result, message: 'ok' });
  } catch (e) {
    const message = (e as Error).message;
    const code = message === '库存不足' ? 400 : 400;
    res.status(code).json({ code, data: null, message });
  }
});

// PUT /api/inbound-records/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const data = dbUpdate(req.params.id, req.body);
    if (!data) {
      res.status(404).json({ code: 404, data: null, message: 'Inbound record not found' });
      return;
    }
    res.json({ code: 0, data, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// DELETE /api/inbound-records/:id
router.delete('/:id', (req: Request, res: Response) => {
  const ok = dbDelete(req.params.id);
  if (!ok) {
    res.status(404).json({ code: 404, data: null, message: 'Inbound record not found' });
    return;
  }
  res.json({ code: 0, data: null, message: 'ok' });
});

export default router;
