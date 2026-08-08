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
} from '../dao/warehouse.js';
import { ok, created, fail, notFound, BizCode } from './_shared/respond.js';

const router = Router();

// GET /api/transit-orders?status=xxx
router.get('/', (req: Request, res: Response) => {
  const data = dbGetAll(req.query.status as string | undefined);
  return ok(res, data);
});

// GET /api/transit-orders/:id
router.get('/:id', (req: Request, res: Response) => {
  const data = dbGetById(req.params.id);
  if (!data) {
    return notFound(res, 'Transit order not found');
  }
  return ok(res, data);
});

// POST /api/transit-orders
router.post('/', (req: Request, res: Response) => {
  try {
    const data = dbCreate(req.body);
    return created(res, data);
  } catch (e) {
    return fail(res, BizCode.BAD_REQUEST, (e as Error).message, 400);
  }
});

// PUT /api/transit-orders/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const data = dbUpdate(req.params.id, req.body);
    if (!data) {
      return notFound(res, 'Transit order not found');
    }
    return ok(res, data);
  } catch (e) {
    return fail(res, BizCode.BAD_REQUEST, (e as Error).message, 400);
  }
});

// DELETE /api/transit-orders/:id
router.delete('/:id', (req: Request, res: Response) => {
  const deleted = dbDelete(req.params.id);
  if (!deleted) {
    return notFound(res, 'Transit order not found');
  }
  return ok(res, { ok: true });
});

// POST /api/transit-orders/:id/status-history — Add a status history entry
router.post('/:id/status-history', (req: Request, res: Response) => {
  try {
    const data = dbAddStatusHistory(req.params.id, req.body);
    return created(res, data);
  } catch (e) {
    return fail(res, BizCode.BAD_REQUEST, (e as Error).message, 400);
  }
});

export default router;
