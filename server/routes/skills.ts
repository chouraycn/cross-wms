/**
 * User Skills + Builtin Status Patches Routes
 *
 * Mounted at /api so:
 * - GET/POST/PUT/DELETE /api/user-skills
 * - GET/PUT /api/builtin-status-patches
 * - DELETE /api/builtin-status-patches/:skillId
 */
import { Router, type Request, type Response } from 'express';
import {
  getUserSkills as dbGetSkills,
  getUserSkillById as dbGetSkillById,
  createUserSkill as dbCreateSkill,
  updateUserSkill as dbUpdateSkill,
  deleteUserSkill as dbDeleteSkill,
  getBuiltinPatches as dbGetPatches,
  setBuiltinPatch as dbSetPatch,
  removeBuiltinPatch as dbRemovePatch,
} from '../db.js';

const router = Router();

// ===================== User Skills =====================

// GET /api/user-skills
router.get('/user-skills', (_req: Request, res: Response) => {
  const data = dbGetSkills();
  res.json({ data });
});

// GET /api/user-skills/:id
router.get('/user-skills/:id', (req: Request, res: Response) => {
  const data = dbGetSkillById(req.params.id);
  if (!data) {
    res.status(404).json({ error: 'Skill not found' });
    return;
  }
  res.json({ data });
});

// POST /api/user-skills
router.post('/user-skills', (req: Request, res: Response) => {
  try {
    const data = dbCreateSkill(req.body);
    res.status(201).json({ data });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// PUT /api/user-skills/:id
router.put('/user-skills/:id', (req: Request, res: Response) => {
  try {
    const data = dbUpdateSkill(req.params.id, req.body);
    if (!data) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    res.json({ data });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// DELETE /api/user-skills/:id
router.delete('/user-skills/:id', (req: Request, res: Response) => {
  const ok = dbDeleteSkill(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Skill not found' });
    return;
  }
  res.json({ ok: true });
});

// ===================== Builtin Status Patches =====================

// GET /api/builtin-status-patches
router.get('/builtin-status-patches', (_req: Request, res: Response) => {
  const data = dbGetPatches();
  res.json({ data });
});

// PUT /api/builtin-status-patches (body: { skillId, status })
router.put('/builtin-status-patches', (req: Request, res: Response) => {
  const { skillId, status } = req.body;
  if (!skillId || !status) {
    res.status(400).json({ error: 'skillId and status are required' });
    return;
  }
  dbSetPatch(skillId, status);
  res.json({ ok: true });
});

// DELETE /api/builtin-status-patches/:skillId
router.delete('/builtin-status-patches/:skillId', (req: Request, res: Response) => {
  const ok = dbRemovePatch(req.params.skillId);
  if (!ok) {
    res.status(404).json({ error: 'Patch not found' });
    return;
  }
  res.json({ ok: true });
});

export default router;
