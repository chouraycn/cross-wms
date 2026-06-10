/**
 * WMS Alert Routes
 *
 * 异常预警的路由：
 * - POST /api/wms/alerts                       创建预警
 * - GET  /api/wms/alerts                       查询预警（支持 warehouseId/alertType/severity/status 过滤）
 * - PUT  /api/wms/alerts/:id/resolve           解决预警（标记为 resolved 或 ignored）
 * - POST /api/wms/alerts/check                 手动触发预警检查（支持规则扫描 + 预测扫描）
 * - GET  /api/wms/alerts/config                获取预警规则配置
 * - POST /api/wms/alerts/config                保存预警规则配置
 * - GET  /api/wms/alerts/prediction/dashboard  获取预测看板汇总数据
 * - GET  /api/wms/alerts/prediction/:sku       获取单 SKU 预测详情
 * - GET  /api/wms/alerts/prediction/config     获取预测配置
 * - POST /api/wms/alerts/prediction/config     保存预测配置
 */
import { Router, type Request, type Response } from 'express';
import {
  createAlert,
  getAlerts,
  getAlertById,
  resolveAlert,
} from '../dao/wmsSkillDao.js';
import { checkAllAlerts } from '../services/alertService.js';
import { checkAllPredictions, getPredictionDetail } from '../services/predictionService.js';
import { initDb } from '../db.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type {
  AlertCheckResult,
  PredictionConfig,
  PredictionDetail,
  AlertThresholds,
} from '../models/wms-skill.js';
import { DEFAULT_PREDICTION_CONFIG } from '../models/wms-skill.js';

const router = Router();

// ===================== 配置持久化辅助函数 =====================

const CONFIG_DIR = path.join(os.homedir(), '.cdf-know-clow');
const ALERT_CONFIG_FILE = path.join(CONFIG_DIR, 'wms-alert-config.json');
const PREDICTION_CONFIG_FILE = path.join(CONFIG_DIR, 'wms-prediction-config.json');

/** 确保配置目录存在 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/** 读取 JSON 配置文件，不存在返回 null */
function readJsonFile<T>(filePath: string): T | null {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    }
  } catch (e) {
    console.error(`读取配置文件失败 ${filePath}:`, e);
  }
  return null;
}

/** 写入 JSON 配置文件 */
function writeJsonFile<T>(filePath: string, data: T): void {
  ensureConfigDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ===================== 预警 CRUD =====================

// POST / — 创建预警
router.post('/', (req: Request, res: Response) => {
  try {
    const { warehouseId, alertType, message } = req.body;
    if (!warehouseId || !alertType || !message) {
      res.status(400).json({ code: 400, data: null, message: '缺少必填字段: warehouseId, alertType, message' });
      return;
    }
    const id = createAlert({
      warehouseId,
      alertType,
      severity: req.body.severity ?? 'medium',
      sku: req.body.sku,
      message,
      status: req.body.status ?? 'active',
    });
    const data = getAlertById(id);
    res.status(201).json({ code: 0, data, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// GET / — 查询预警
router.get('/', (req: Request, res: Response) => {
  const data = getAlerts({
    warehouseId: req.query.warehouseId as string | undefined,
    alertType: req.query.alertType as string | undefined,
    severity: req.query.severity as string | undefined,
    status: req.query.status as string | undefined,
  });
  res.json({ code: 0, data, message: 'ok' });
});

// PUT /:id/resolve — 解决预警
router.put('/:id/resolve', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ code: 400, data: null, message: '无效的 ID' });
    return;
  }
  const { resolution } = req.body;
  if (resolution !== 'resolved' && resolution !== 'ignored') {
    res.status(400).json({ code: 400, data: null, message: 'resolution 必须为 resolved 或 ignored' });
    return;
  }
  const ok = resolveAlert(id, resolution);
  if (!ok) {
    res.status(404).json({ code: 404, data: null, message: '预警记录不存在' });
    return;
  }
  const data = getAlertById(id);
  res.json({ code: 0, data, message: 'ok' });
});

// ===================== 预警检查（扩展支持预测扫描）=====================

// POST /check — 手动触发预警检查（规则扫描 + 可选预测扫描）
router.post('/check', (req: Request, res: Response) => {
  try {
    const includePrediction: boolean = req.body.includePrediction === true;
    const warehouseId = req.body.warehouseId as string | undefined;
    const lowStockThreshold = req.body.lowStockThreshold as number | undefined;

    const db = initDb();

    // 构建阈值配置
    const thresholds: AlertThresholds = {};
    if (lowStockThreshold !== undefined) {
      thresholds.lowStock = lowStockThreshold;
    }

    // 1. 规则扫描
    checkAllAlerts(db, thresholds).then(async (ruleResult: AlertCheckResult) => {
      // 2. 如果启用预测，执行预测扫描
      if (includePrediction) {
        try {
          const predConfig = readJsonFile<PredictionConfig>(PREDICTION_CONFIG_FILE)
            ?? DEFAULT_PREDICTION_CONFIG;
          const predResult = await checkAllPredictions(db, predConfig);

          // 合并结果
          const merged: AlertCheckResult = {
            newAlerts: ruleResult.newAlerts + predResult.newAlerts,
            lowStockAlerts: ruleResult.lowStockAlerts,
            expiryAlerts: ruleResult.expiryAlerts,
            stagnantAlerts: ruleResult.stagnantAlerts,
            predictedShortageAlerts: predResult.predictedShortageAlerts,
            predictedOverstockAlerts: predResult.predictedOverstockAlerts,
            errors: [...ruleResult.errors, ...predResult.errors],
          };

          res.json({ code: 0, data: merged, message: 'ok' });
        } catch (predErr) {
          // 预测失败不影响规则扫描结果
          ruleResult.errors.push(
            `预测扫描失败: ${predErr instanceof Error ? predErr.message : String(predErr)}`
          );
          res.json({ code: 0, data: ruleResult, message: 'ok' });
        }
      } else {
        res.json({ code: 0, data: ruleResult, message: 'ok' });
      }
    }).catch((ruleErr: Error) => {
      res.status(400).json({
        code: 400,
        data: null,
        message: `规则扫描失败: ${ruleErr.message}`,
      });
    });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// ===================== 预警规则配置 =====================

// GET /config — 获取预警规则配置
router.get('/config', (_req: Request, res: Response) => {
  try {
    const config = readJsonFile<AlertThresholds & { enableLowStock?: boolean; enableExpiry?: boolean; enableStagnant?: boolean }>(ALERT_CONFIG_FILE);
    if (config) {
      res.json({ code: 0, data: config, message: 'ok' });
    } else {
      // 返回默认值
      res.json({
        code: 0,
        data: {
          lowStock: 10,
          expiryDays: 30,
          stagnantDays: 90,
          enableLowStock: true,
          enableExpiry: true,
          enableStagnant: true,
        },
        message: 'ok',
      });
    }
  } catch (e) {
    res.status(500).json({ code: 500, data: null, message: (e as Error).message });
  }
});

// POST /config — 保存预警规则配置
router.post('/config', (req: Request, res: Response) => {
  try {
    writeJsonFile(ALERT_CONFIG_FILE, req.body);
    res.json({ code: 0, data: req.body, message: '配置已保存' });
  } catch (e) {
    res.status(500).json({ code: 500, data: null, message: (e as Error).message });
  }
});

// ===================== 智能预测 API =====================

// GET /prediction/dashboard — 预测看板汇总数据
router.get('/prediction/dashboard', (_req: Request, res: Response) => {
  try {
    const db = initDb();

    // 统计预测型活跃预警数量
    const shortageCount = db.prepare(`
      SELECT COUNT(*) AS cnt FROM wms_alerts
      WHERE alert_type = 'predicted_shortage' AND status = 'active'
    `).get() as { cnt: number };

    const overstockCount = db.prepare(`
      SELECT COUNT(*) AS cnt FROM wms_alerts
      WHERE alert_type = 'predicted_overstock' AND status = 'active'
    `).get() as { cnt: number };

    // 待补货 SKU 数（有预测短缺预警的不同 SKU 数）
    const pendingReplenish = db.prepare(`
      SELECT COUNT(DISTINCT sku) AS cnt FROM wms_alerts
      WHERE alert_type = 'predicted_shortage' AND status = 'active' AND sku IS NOT NULL
    `).get() as { cnt: number };

    // 数据覆盖率：有足够出库记录的 SKU 占比
    const totalSkus = db.prepare(`
      SELECT COUNT(*) AS cnt FROM inventory_items WHERE quantity > 0
    `).get() as { cnt: number };

    const config = readJsonFile<PredictionConfig>(PREDICTION_CONFIG_FILE) ?? DEFAULT_PREDICTION_CONFIG;
    const minDays = config.minHistoryDays;

    const skusWithEnoughHistory = db.prepare(`
      SELECT COUNT(DISTINCT it.sku) AS cnt FROM (
        SELECT sku, warehouse_id, COUNT(DISTINCT DATE(created_at)) AS days
        FROM inventory_transactions
        WHERE type IN ('outbound', 'transfer_out')
          AND created_at >= DATE('now', '-30 days')
        GROUP BY sku, warehouse_id
        HAVING days >= ?
      )
    `).get(minDays) as { cnt: number };

    const coverageRate = totalSkus.cnt > 0
      ? Math.round((skusWithEnoughHistory.cnt / totalSkus.cnt) * 100)
      : 0;

    res.json({
      code: 0,
      data: {
        predictedShortageCount: shortageCount.cnt,
        predictedOverstockCount: overstockCount.cnt,
        pendingReplenishSkuCount: pendingReplenish.cnt,
        dataCoverageRate: coverageRate,
      },
      message: 'ok',
    });
  } catch (e) {
    res.status(500).json({ code: 500, data: null, message: (e as Error).message });
  }
});

// GET /prediction/config — 获取预测配置
router.get('/prediction/config', (_req: Request, res: Response) => {
  try {
    const config = readJsonFile<PredictionConfig>(PREDICTION_CONFIG_FILE) ?? DEFAULT_PREDICTION_CONFIG;
    res.json({ code: 0, data: config, message: 'ok' });
  } catch (e) {
    res.status(500).json({ code: 500, data: null, message: (e as Error).message });
  }
});

// POST /prediction/config — 保存预测配置
router.post('/prediction/config', (req: Request, res: Response) => {
  try {
    const config: PredictionConfig = {
      enabled: req.body.enabled ?? DEFAULT_PREDICTION_CONFIG.enabled,
      predictionDays: req.body.predictionDays ?? DEFAULT_PREDICTION_CONFIG.predictionDays,
      shortageThreshold: req.body.shortageThreshold ?? DEFAULT_PREDICTION_CONFIG.shortageThreshold,
      overstockDays: req.body.overstockDays ?? DEFAULT_PREDICTION_CONFIG.overstockDays,
      minHistoryDays: req.body.minHistoryDays ?? DEFAULT_PREDICTION_CONFIG.minHistoryDays,
    };
    writeJsonFile(PREDICTION_CONFIG_FILE, config);
    res.json({ code: 0, data: config, message: '预测配置已保存' });
  } catch (e) {
    res.status(500).json({ code: 500, data: null, message: (e as Error).message });
  }
});

// GET /prediction/:sku — 获取单 SKU 预测详情
router.get('/prediction/:sku', (req: Request, res: Response) => {
  try {
    const { sku } = req.params;
    const warehouseId = req.query.warehouseId as string | undefined;

    if (!sku) {
      res.status(400).json({ code: 400, data: null, message: '缺少 SKU 参数' });
      return;
    }

    if (!warehouseId) {
      res.status(400).json({ code: 400, data: null, message: '缺少 warehouseId 查询参数' });
      return;
    }

    const db = initDb();
    const config = readJsonFile<PredictionConfig>(PREDICTION_CONFIG_FILE) ?? DEFAULT_PREDICTION_CONFIG;

    const detail: PredictionDetail | null = getPredictionDetail(db, sku, warehouseId, config);

    if (!detail) {
      res.status(404).json({ code: 404, data: null, message: '未找到该 SKU 的预测数据（可能库存为0或无出库记录）' });
      return;
    }

    res.json({ code: 0, data: detail, message: 'ok' });
  } catch (e) {
    res.status(500).json({ code: 500, data: null, message: (e as Error).message });
  }
});

export default router;
