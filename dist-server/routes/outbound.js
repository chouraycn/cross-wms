"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Outbound Records CRUD Routes
 */
const express_1 = require("express");
const db_js_1 = require("../db.js");
const router = (0, express_1.Router)();
// GET /api/outbound-records?warehouseId=xxx
router.get('/', (req, res) => {
    const data = (0, db_js_1.getOutboundRecords)(req.query.warehouseId);
    res.json({ data });
});
// GET /api/outbound-records/:id
router.get('/:id', (req, res) => {
    const data = (0, db_js_1.getOutboundRecordById)(req.params.id);
    if (!data) {
        res.status(404).json({ error: 'Outbound record not found' });
        return;
    }
    res.json({ data });
});
// POST /api/outbound-records
router.post('/', (req, res) => {
    try {
        const data = (0, db_js_1.createOutboundRecord)(req.body);
        res.status(201).json({ data });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// PUT /api/outbound-records/:id
router.put('/:id', (req, res) => {
    try {
        const data = (0, db_js_1.updateOutboundRecord)(req.params.id, req.body);
        if (!data) {
            res.status(404).json({ error: 'Outbound record not found' });
            return;
        }
        res.json({ data });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// DELETE /api/outbound-records/:id
router.delete('/:id', (req, res) => {
    const ok = (0, db_js_1.deleteOutboundRecord)(req.params.id);
    if (!ok) {
        res.status(404).json({ error: 'Outbound record not found' });
        return;
    }
    res.json({ ok: true });
});
exports.default = router;
