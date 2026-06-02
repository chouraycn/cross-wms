"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Inventory Items CRUD Routes
 */
const express_1 = require("express");
const db_js_1 = require("../db.js");
const router = (0, express_1.Router)();
// GET /api/inventory?warehouseId=xxx
router.get('/', (req, res) => {
    const data = (0, db_js_1.getInventoryItems)(req.query.warehouseId);
    res.json({ data });
});
// GET /api/inventory/:id
router.get('/:id', (req, res) => {
    const data = (0, db_js_1.getInventoryItemById)(req.params.id);
    if (!data) {
        res.status(404).json({ error: 'Inventory item not found' });
        return;
    }
    res.json({ data });
});
// POST /api/inventory
router.post('/', (req, res) => {
    try {
        const data = (0, db_js_1.createInventoryItem)(req.body);
        res.status(201).json({ data });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// PUT /api/inventory/:id
router.put('/:id', (req, res) => {
    try {
        const data = (0, db_js_1.updateInventoryItem)(req.params.id, req.body);
        if (!data) {
            res.status(404).json({ error: 'Inventory item not found' });
            return;
        }
        res.json({ data });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// DELETE /api/inventory/:id
router.delete('/:id', (req, res) => {
    const ok = (0, db_js_1.deleteInventoryItem)(req.params.id);
    if (!ok) {
        res.status(404).json({ error: 'Inventory item not found' });
        return;
    }
    res.json({ ok: true });
});
exports.default = router;
