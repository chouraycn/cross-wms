import { Router } from 'express';
import { logger } from '../logger.js';
import { globalRegistry } from '../engine/context-engine/index.js';

const router = Router();

router.get('/engines', (req, res) => {
  try {
    const engines = globalRegistry.listEngines();
    
    const result = engines.map(engine => ({
      id: engine.engineId,
      config: {
        name: engine.displayName,
        description: engine.description,
        version: engine.version,
      },
      isDefault: globalRegistry.getDefaultEngineId() === engine.engineId,
      owner: globalRegistry.getOwner(engine.engineId),
      health: globalRegistry.getHealth(engine.engineId) || { status: 'unknown' as const },
    }));
    
    res.json({ data: result, total: result.length });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to list engines:', e);
    res.status(500).json({ error: `获取引擎列表失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

router.get('/engines/:id', (req, res) => {
  try {
    const { id } = req.params;
    const engines = globalRegistry.listEngines();
    const engine = engines.find(e => e.engineId === id);
    
    if (!engine) {
      return res.status(404).json({ error: '引擎不存在' });
    }
    
    const health = globalRegistry.getHealth(id);
    
    res.json({
      data: {
        id: engine.engineId,
        config: {
          name: engine.displayName,
          description: engine.description,
          version: engine.version,
        },
        isDefault: globalRegistry.getDefaultEngineId() === id,
        owner: globalRegistry.getOwner(id),
        health,
      },
    });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to get engine:', e);
    res.status(500).json({ error: `获取引擎信息失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

router.post('/engines/:id/quarantine', (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body as { reason?: string };
    
    globalRegistry.recordFailure(id, reason);
    res.json({ success: true });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to quarantine engine:', e);
    res.status(500).json({ error: `隔离引擎失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

router.post('/engines/:id/recover', (req, res) => {
  try {
    const { id } = req.params;
    const success = globalRegistry.resetHealth(id);
    res.json({ success });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to recover engine:', e);
    res.status(500).json({ error: `恢复引擎失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

router.get('/stats', (req, res) => {
  try {
    const engines = globalRegistry.listEngines();
    
    let activeCount = 0;
    let quarantinedCount = 0;
    
    for (const engine of engines) {
      const health = globalRegistry.getHealth(engine.engineId);
      if (health?.status === 'quarantined') {
        quarantinedCount++;
      } else {
        activeCount++;
      }
    }
    
    const stats = {
      totalEngines: engines.length,
      activeEngines: activeCount,
      quarantinedEngines: quarantinedCount,
      totalOperations: 0,
      avgLatencyMs: 0,
    };
    
    res.json({ data: stats });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to get stats:', e);
    res.status(500).json({ error: `获取统计信息失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

export { router as contextEngineRouter };