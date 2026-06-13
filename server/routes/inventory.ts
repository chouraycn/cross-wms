/**
 * Inventory Items CRUD Routes
 */
import { Router, type Request, type Response } from 'express';
import {
  getInventoryItems as dbGetAll,
  getInventoryItemById as dbGetById,
  createInventoryItem as dbCreate,
  updateInventoryItem as dbUpdate,
  deleteInventoryItem as dbDelete,
} from '../dao/warehouse.js';

const router = Router();

// GET /api/inventory?warehouseId=xxx
router.get('/', (req: Request, res: Response) => {
  const data = dbGetAll(req.query.warehouseId as string | undefined);
  res.json({ code: 0, data, message: 'ok' });
});

// GET /api/inventory/:id
router.get('/:id', (req: Request, res: Response) => {
  const data = dbGetById(req.params.id);
  if (!data) {
    res.status(404).json({ code: 404, data: null, message: 'Inventory item not found' });
    return;
  }
  res.json({ code: 0, data, message: 'ok' });
});

// POST /api/inventory
router.post('/', (req: Request, res: Response) => {
  try {
    const data = dbCreate(req.body);
    res.status(201).json({ code: 0, data, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// PUT /api/inventory/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const data = dbUpdate(req.params.id, req.body);
    if (!data) {
      res.status(404).json({ code: 404, data: null, message: 'Inventory item not found' });
      return;
    }
    res.json({ code: 0, data, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// DELETE /api/inventory/:id
router.delete('/:id', (req: Request, res: Response) => {
  const ok = dbDelete(req.params.id);
  if (!ok) {
    res.status(404).json({ code: 404, data: null, message: 'Inventory item not found' });
    return;
  }
  res.json({ code: 0, data: null, message: 'ok' });
});

export default router;
