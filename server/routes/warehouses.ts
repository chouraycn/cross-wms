/**
 * Warehouses CRUD Routes
 */
import { Router, type Request, type Response } from 'express';
import {
  getWarehouses as dbGetAll,
  getWarehouseById as dbGetById,
  createWarehouse as dbCreate,
  updateWarehouse as dbUpdate,
  deleteWarehouse as dbDelete,
} from '../dao/warehouse.js';
import { ok, created, fail, notFound, BizCode } from './_shared/respond.js';

const router = Router();

// GET /api/warehouses
router.get('/', (req: Request, res: Response) => {
  const warehouseType = req.query.type as string | undefined;
  const data = dbGetAll(warehouseType);
  return ok(res, data);
});

// GET /api/warehouses/:id
router.get('/:id', (req: Request, res: Response) => {
  const data = dbGetById(req.params.id);
  if (!data) {
    return notFound(res, 'Warehouse not found');
  }
  return ok(res, data);
});

// POST /api/warehouses
router.post('/', (req: Request, res: Response) => {
  try {
    const data = dbCreate(req.body);
    return created(res, data);
  } catch (e) {
    return fail(res, BizCode.BAD_REQUEST, (e as Error).message, 400);
  }
});

// PUT /api/warehouses/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const data = dbUpdate(req.params.id, req.body);
    if (!data) {
      return notFound(res, 'Warehouse not found');
    }
    return ok(res, data);
  } catch (e) {
    return fail(res, BizCode.BAD_REQUEST, (e as Error).message, 400);
  }
});

// DELETE /api/warehouses/:id
router.delete('/:id', (req: Request, res: Response) => {
  const deleted = dbDelete(req.params.id);
  if (!deleted) {
    return notFound(res, 'Warehouse not found');
  }
  return ok(res, { ok: true });
});

export default router;
