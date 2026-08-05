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
import { ok, fail, notFound } from './_shared/respond.js';

const router = Router();

// GET /api/inventory?warehouseId=xxx
router.get('/', (_req: Request, res: Response) => {
  ok(res, dbGetAll(_req.query.warehouseId as string | undefined));
});

// GET /api/inventory/:id
router.get('/:id', (req: Request, res: Response) => {
  const data = dbGetById(req.params.id);
  if (!data) return notFound(res, 'Inventory item not found');
  ok(res, data);
});

// POST /api/inventory
router.post('/', (req: Request, res: Response) => {
  try {
    const data = dbCreate(req.body);
    res.status(201);
    return ok(res, data);
  } catch (e) {
    return fail(res, 400, (e as Error).message);
  }
});

// PUT /api/inventory/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const data = dbUpdate(req.params.id, req.body);
    if (!data) return notFound(res, 'Inventory item not found');
    ok(res, data);
  } catch (e) {
    return fail(res, 400, (e as Error).message);
  }
});

// DELETE /api/inventory/:id
router.delete('/:id', (req: Request, res: Response) => {
  if (!dbDelete(req.params.id)) return notFound(res, 'Inventory item not found');
  ok(res, null);
});

export default router;
