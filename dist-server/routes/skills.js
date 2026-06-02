"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * User Skills + Builtin Status Patches Routes
 *
 * Mounted at /api so:
 * - GET/POST/PUT/DELETE /api/user-skills
 * - GET/PUT /api/builtin-status-patches
 * - DELETE /api/builtin-status-patches/:skillId
 */
const express_1 = require("express");
const db_js_1 = require("../db.js");
const router = (0, express_1.Router)();
// ===================== User Skills =====================
// GET /api/user-skills
router.get('/user-skills', (_req, res) => {
    const data = (0, db_js_1.getUserSkills)();
    res.json({ data });
});
// GET /api/user-skills/:id
router.get('/user-skills/:id', (req, res) => {
    const data = (0, db_js_1.getUserSkillById)(req.params.id);
    if (!data) {
        res.status(404).json({ error: 'Skill not found' });
        return;
    }
    res.json({ data });
});
// POST /api/user-skills
router.post('/user-skills', (req, res) => {
    try {
        const data = (0, db_js_1.createUserSkill)(req.body);
        res.status(201).json({ data });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// PUT /api/user-skills/:id
router.put('/user-skills/:id', (req, res) => {
    try {
        const data = (0, db_js_1.updateUserSkill)(req.params.id, req.body);
        if (!data) {
            res.status(404).json({ error: 'Skill not found' });
            return;
        }
        res.json({ data });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// DELETE /api/user-skills/:id
router.delete('/user-skills/:id', (req, res) => {
    const ok = (0, db_js_1.deleteUserSkill)(req.params.id);
    if (!ok) {
        res.status(404).json({ error: 'Skill not found' });
        return;
    }
    res.json({ ok: true });
});
// ===================== Builtin Status Patches =====================
// GET /api/builtin-status-patches
router.get('/builtin-status-patches', (_req, res) => {
    const data = (0, db_js_1.getBuiltinPatches)();
    res.json({ data });
});
// PUT /api/builtin-status-patches (body: { skillId, status })
router.put('/builtin-status-patches', (req, res) => {
    const { skillId, status } = req.body;
    if (!skillId || !status) {
        res.status(400).json({ error: 'skillId and status are required' });
        return;
    }
    (0, db_js_1.setBuiltinPatch)(skillId, status);
    res.json({ ok: true });
});
// DELETE /api/builtin-status-patches/:skillId
router.delete('/builtin-status-patches/:skillId', (req, res) => {
    const ok = (0, db_js_1.removeBuiltinPatch)(req.params.skillId);
    if (!ok) {
        res.status(404).json({ error: 'Patch not found' });
        return;
    }
    res.json({ ok: true });
});
exports.default = router;
