/**
 * Outbound Records CRUD Routes
 */
import { Router, type Request, type Response } from 'express';
import {
  getOutboundRecords as dbGetAll,
  getOutboundRecordById as dbGetById,
  createOutboundRecord as dbCreate,
  updateOutboundRecord as dbUpdate,
  deleteOutboundRecord as dbDelete,
} from '../db.js';

const router = Router();

// GET /api/outbound-records?warehouseId=xxx
router.get('/', (req: Request, res: Response) => {
  const data = dbGetAll(req.query.warehouseId as string | undefined);
  res.json({ data });
});

// GET /api/outbound-records/:id
router.get('/:id', (req: Request, res: Response) => {
  const data = dbGetById(req.params.id);
  if (!data) {
    res.status(404).json({ error: 'Outbound record not found' });
    return;
  }
  res.json({ data });
});

// POST /api/outbound-records
router.post('/', (req: Request, res: Response) => {
  try {
    const data = dbCreate(req.body);
    res.status(201).json({ data });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// PUT /api/outbound-records/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const data = dbUpdate(req.params.id, req.body);
    if (!data) {
      res.status(404).json({ error: 'Outbound record not found' });
      return;
    }
    res.json({ data });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// DELETE /api/outbound-records/:id
router.delete('/:id', (req: Request, res: Response) => {
  const ok = dbDelete(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Outbound record not found' });
    return;
  }
  res.json({ ok: true });
});

export default router;
