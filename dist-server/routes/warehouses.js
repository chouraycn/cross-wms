"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Warehouses CRUD Routes
 */
const express_1 = require("express");
const db_js_1 = require("../db.js");
const router = (0, express_1.Router)();
// GET /api/warehouses
router.get('/', (_req, res) => {
    const data = (0, db_js_1.getWarehouses)();
    res.json({ data });
});
// GET /api/warehouses/:id
router.get('/:id', (req, res) => {
    const data = (0, db_js_1.getWarehouseById)(req.params.id);
    if (!data) {
        res.status(404).json({ error: 'Warehouse not found' });
        return;
    }
    res.json({ data });
});
// POST /api/warehouses
router.post('/', (req, res) => {
    try {
        const data = (0, db_js_1.createWarehouse)(req.body);
        res.status(201).json({ data });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// PUT /api/warehouses/:id
router.put('/:id', (req, res) => {
    try {
        const data = (0, db_js_1.updateWarehouse)(req.params.id, req.body);
        if (!data) {
            res.status(404).json({ error: 'Warehouse not found' });
            return;
        }
        res.json({ data });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// DELETE /api/warehouses/:id
router.delete('/:id', (req, res) => {
    const ok = (0, db_js_1.deleteWarehouse)(req.params.id);
    if (!ok) {
        res.status(404).json({ error: 'Warehouse not found' });
        return;
    }
    res.json({ ok: true });
});
exports.default = router;
