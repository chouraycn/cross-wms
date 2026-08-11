import { Router, type Request, type Response } from 'express';
import { getKeywordTriggerEngine, initKeywordTriggerEngine } from '../engine/keywordTriggerEngine.js';
import { logger } from '../logger.js';
import { ok } from './_shared/respond.js';

const router = Router();

router.get('/config', (req: Request, res: Response) => {
  const engine = getKeywordTriggerEngine();
  ok(res, engine.getConfig());
});

router.put('/config', (req: Request, res: Response) => {
  try {
    const engine = getKeywordTriggerEngine();
    engine.updateConfig(req.body);
    ok(res, { ok: true, config: engine.getConfig() });
  } catch (e) {
    logger.error('[KeywordTrigger] Failed to update config:', e);
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/stats', (req: Request, res: Response) => {
  const engine = getKeywordTriggerEngine();
  ok(res, engine.getStats());
});

router.get('/keywords', (req: Request, res: Response) => {
  const engine = getKeywordTriggerEngine();
  ok(res, { keywords: engine.getAllKeywords() });
});

router.get('/tool-names', (req: Request, res: Response) => {
  const engine = getKeywordTriggerEngine();
  ok(res, { toolNames: engine.getAllToolNames() });
});

router.get('/pinyin-keywords', (req: Request, res: Response) => {
  const engine = getKeywordTriggerEngine();
  ok(res, { pinyinKeywords: engine.getAllPinyinKeywords() });
});

router.get('/synonyms', (req: Request, res: Response) => {
  const engine = getKeywordTriggerEngine();
  ok(res, { synonyms: engine.getAllSynonyms() });
});

router.get('/rules', (req: Request, res: Response) => {
  const engine = getKeywordTriggerEngine();
  ok(res, { rules: engine.getAllRules() });
});

router.get('/rules/:skillId', (req: Request, res: Response) => {
  const engine = getKeywordTriggerEngine();
  const rule = engine.getRuleBySkillId(req.params.skillId);
  if (!rule) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }
  ok(res, { rule });
});

router.post('/synonyms', (req: Request, res: Response) => {
  try {
    const { keyword, synonym } = req.body;
    if (!keyword || !synonym) {
      res.status(400).json({ error: 'keyword and synonym are required' });
      return;
    }
    const engine = getKeywordTriggerEngine();
    engine.addSynonym(keyword, synonym);
    ok(res, { ok: true });
  } catch (e) {
    logger.error('[KeywordTrigger] Failed to add synonym:', e);
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/test', (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }
  const engine = getKeywordTriggerEngine();
  const extractedKeywords = engine.extractKeywords(message);
  const matches = engine.matchMessage(message);
  ok(res, { message, extractedKeywords, matches });
});

router.post('/init', (req: Request, res: Response) => {
  try {
    initKeywordTriggerEngine(req.body);
    ok(res, { ok: true });
  } catch (e) {
    logger.error('[KeywordTrigger] Failed to init:', e);
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/refresh', (req: Request, res: Response) => {
  const engine = getKeywordTriggerEngine();
  engine.refreshRules();
  ok(res, { ok: true });
});

router.post('/stats/reset', (req: Request, res: Response) => {
  const engine = getKeywordTriggerEngine();
  engine.resetStats();
  ok(res, { ok: true });
});

export default router;