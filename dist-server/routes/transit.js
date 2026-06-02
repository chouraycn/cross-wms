"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Transit Orders CRUD Routes + Status History
 */
const express_1 = require("express");
const db_js_1 = require("../db.js");
const router = (0, express_1.Router)();
// GET /api/transit-orders?status=xxx
router.get('/', (req, res) => {
    const data = (0, db_js_1.getTransitOrders)(req.query.status);
    res.json({ data });
});
// GET /api/transit-orders/:id
router.get('/:id', (req, res) => {
    const data = (0, db_js_1.getTransitOrderById)(req.params.id);
    if (!data) {
        res.status(404).json({ error: 'Transit order not found' });
        return;
    }
    res.json({ data });
});
// POST /api/transit-orders
router.post('/', (req, res) => {
    try {
        const data = (0, db_js_1.createTransitOrder)(req.body);
        res.status(201).json({ data });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// PUT /api/transit-orders/:id
router.put('/:id', (req, res) => {
    try {
        const data = (0, db_js_1.updateTransitOrder)(req.params.id, req.body);
        if (!data) {
            res.status(404).json({ error: 'Transit order not found' });
            return;
        }
        res.json({ data });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// DELETE /api/transit-orders/:id
router.delete('/:id', (req, res) => {
    const ok = (0, db_js_1.deleteTransitOrder)(req.params.id);
    if (!ok) {
        res.status(404).json({ error: 'Transit order not found' });
        return;
    }
    res.json({ ok: true });
});
// POST /api/transit-orders/:id/status-history — Add a status history entry
router.post('/:id/status-history', (req, res) => {
    try {
        const data = (0, db_js_1.addStatusHistory)(req.params.id, req.body);
        res.status(201).json({ data });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
exports.default = router;
