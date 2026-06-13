import { Router } from 'express';
import { findByQuery, countByQuery } from '../dao/inventoryTransactionDao.js';

const router = Router();

// GET /inventory-transactions?page=1&pageSize=20&type=inbound&warehouseId=wh1&startDate=2026-01-01&endDate=2026-05-25&sku=ABC
router.get('/', (req, res) => {
  const page = parseInt(req.query.page as string, 10) || 1;
  const pageSize = parseInt(req.query.pageSize as string, 10) || 20;
  const type = req.query.type as string | undefined;
  const warehouseId = req.query.warehouseId as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const sku = req.query.sku as string | undefined;

  const items = findByQuery({ type, warehouseId, startDate, endDate, sku, page, pageSize });
  const total = countByQuery({ type, warehouseId, startDate, endDate, sku });

  res.json({
    code: 0,
    data: { items, total, page, pageSize },
    message: 'ok',
  });
});

export default router;
