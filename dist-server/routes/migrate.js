"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Migration Route — POST /api/migrate
 *
 * Accepts all localStorage data and writes it into SQLite in a single transaction.
 * Uses INSERT OR REPLACE for idempotency.
 */
const express_1 = require("express");
const db_js_1 = require("../db.js");
const router = (0, express_1.Router)();
// POST /api/migrate
router.post('/', (req, res) => {
    try {
        const result = (0, db_js_1.migrateData)(req.body);
        res.json({ data: result });
    }
    catch (e) {
        console.error('[Migrate API] Migration failed:', e);
        res.status(500).json({ error: e.message });
    }
});
exports.default = router;
