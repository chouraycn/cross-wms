"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * App Settings Routes (key-value store)
 *
 * Mounted at /api/app-settings so:
 * - GET /api/app-settings/:key
 * - PUT /api/app-settings/:key
 */
const express_1 = require("express");
const db_js_1 = require("../db.js");
const router = (0, express_1.Router)();
// GET /api/app-settings/:key
router.get('/:key', (req, res) => {
    const value = (0, db_js_1.getAppSettings)(req.params.key);
    if (value === null) {
        res.status(404).json({ error: 'Settings not found' });
        return;
    }
    try {
        const data = JSON.parse(value);
        res.json({ data });
    }
    catch {
        // Return raw string if not valid JSON
        res.json({ data: value });
    }
});
// PUT /api/app-settings/:key
router.put('/:key', (req, res) => {
    try {
        const value = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        (0, db_js_1.setAppSettings)(req.params.key, value);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
exports.default = router;
