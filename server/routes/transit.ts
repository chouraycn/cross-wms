/**
 * Transit Orders CRUD Routes + Status History
 */
import { Router, type Request, type Response } from 'express';
import {
  getTransitOrders as dbGetAll,
  getTransitOrderById as dbGetById,
  createTransitOrder as dbCreate,
  updateTransitOrder as dbUpdate,
  deleteTransitOrder as dbDelete,
  addStatusHistory as dbAddStatusHistory,
} from '../db.js';

const router = Router();

// GET /api/transit-orders?status=xxx
router.get('/', (req: Request, res: Response) => {
  const data = dbGetAll(req.query.status as string | undefined);
  res.json({ data });
});

// GET /api/transit-orders/:id
router.get('/:id', (req: Request, res: Response) => {
  const data = dbGetById(req.params.id);
  if (!data) {
    res.status(404).json({ error: 'Transit order not found' });
    return;
  }
  res.json({ data });
});

// POST /api/transit-orders
router.post('/', (req: Request, res: Response) => {
  try {
    const data = dbCreate(req.body);
    res.status(201).json({ data });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// PUT /api/transit-orders/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const data = dbUpdate(req.params.id, req.body);
    if (!data) {
      res.status(404).json({ error: 'Transit order not found' });
      return;
    }
    res.json({ data });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// DELETE /api/transit-orders/:id
router.delete('/:id', (req: Request, res: Response) => {
  const ok = dbDelete(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Transit order not found' });
    return;
  }
  res.json({ ok: true });
});

// POST /api/transit-orders/:id/status-history — Add a status history entry
router.post('/:id/status-history', (req: Request, res: Response) => {
  try {
    const data = dbAddStatusHistory(req.params.id, req.body);
    res.status(201).json({ data });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

export default router;
