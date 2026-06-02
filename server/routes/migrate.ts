/**
 * Migration Route — POST /api/migrate
 *
 * Accepts all localStorage data and writes it into SQLite in a single transaction.
 * Uses INSERT OR REPLACE for idempotency.
 */
import { Router, type Request, type Response } from 'express';
import { migrateData as dbMigrate } from '../db.js';

const router = Router();

// POST /api/migrate
router.post('/', (req: Request, res: Response) => {
  try {
    const result = dbMigrate(req.body);
    res.json({ data: result });
  } catch (e) {
    console.error('[Migrate API] Migration failed:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
