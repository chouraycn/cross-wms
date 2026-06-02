"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Inbound Records CRUD Routes
 */
const express_1 = require("express");
const db_js_1 = require("../db.js");
const router = (0, express_1.Router)();
// GET /api/inbound-records?warehouseId=xxx
router.get('/', (req, res) => {
    const data = (0, db_js_1.getInboundRecords)(req.query.warehouseId);
    res.json({ data });
});
// GET /api/inbound-records/:id
router.get('/:id', (req, res) => {
    const data = (0, db_js_1.getInboundRecordById)(req.params.id);
    if (!data) {
        res.status(404).json({ error: 'Inbound record not found' });
        return;
    }
    res.json({ data });
});
// POST /api/inbound-records
router.post('/', (req, res) => {
    try {
        const data = (0, db_js_1.createInboundRecord)(req.body);
        res.status(201).json({ data });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// PUT /api/inbound-records/:id
router.put('/:id', (req, res) => {
    try {
        const data = (0, db_js_1.updateInboundRecord)(req.params.id, req.body);
        if (!data) {
            res.status(404).json({ error: 'Inbound record not found' });
            return;
        }
        res.json({ data });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// DELETE /api/inbound-records/:id
router.delete('/:id', (req, res) => {
    const ok = (0, db_js_1.deleteInboundRecord)(req.params.id);
    if (!ok) {
        res.status(404).json({ error: 'Inbound record not found' });
        return;
    }
    res.json({ ok: true });
});
exports.default = router;
