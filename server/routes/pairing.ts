/**
 * Pairing REST API 路由 — 设备配对管理
 *
 * 提供以下端点：
 * POST   /api/pairing/generate-code   → 生成 6 位配对码（含过期时间）
 * GET    /api/pairing/sessions        → 获取配对会话列表
 * GET    /api/pairing/devices         → 获取已配对设备列表
 * DELETE /api/pairing/devices/:id     → 取消配对（移除已配对设备）
 * POST   /api/pairing/discover        → 扫描附近可配对设备
 *
 * 实现说明：
 * - 复用 server/engine/pairing/ 下的 PairingCodeGenerator 生成配对码
 * - 已配对设备 / 会话使用进程内内存存储（演示用途；后续可接入持久化层）
 * - 设备发现返回内存中已注册的示例设备，便于前端联调
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from '../logger.js';
import {
  PairingCodeGenerator,
} from '../engine/pairing/index.js';
import type {
  PairingCodeInfo,
  PairingSession,
  PairedDevice,
  DeviceInfo,
  DiscoveredDevice,
} from '../engine/pairing/index.js';

const router = Router();

// ===================== 进程内存储 =====================

/** 6 位配对码生成器（任务要求 6 位配对码） */
const codeGenerator = new PairingCodeGenerator({
  codeLength: 6,
  ttlMs: 10 * 60 * 1000, // 10 分钟有效期
});

/** 当前活跃的配对码（同一时刻仅保留最新一个） */
let currentCode: PairingCodeInfo | null = null;

/** 已配对设备列表（内存存储） */
const pairedDevices = new Map<string, PairedDevice>();

/** 配对会话列表（内存存储） */
const pairingSessions = new Map<string, PairingSession>();

/** 已发现的附近设备（内存存储，扫描结果缓存） */
let discoveredDevices: DiscoveredDevice[] = [];

/** 本机设备信息（用于生成会话） */
const localDevice: DeviceInfo = {
  deviceId: 'local-server',
  deviceName: 'Cross-WMS Server',
  deviceType: 'desktop',
  osName: process.platform,
  osVersion: process.version,
  appVersion: '1.0.0',
  capabilities: ['chat', 'file-transfer', 'remote-control'],
};

// 初始化两条示例数据，便于前端展示（演示用途）
function seedDemoData() {
  const now = Date.now();
  const demoDevice1: PairedDevice = {
    deviceId: 'demo-mobile-1',
    deviceInfo: {
      deviceId: 'demo-mobile-1',
      deviceName: 'iPhone 14 Pro',
      deviceType: 'mobile',
      osName: 'iOS',
      osVersion: '17.4',
      appVersion: '1.0.0',
    },
    pairedAt: now - 3600_000,
    lastSeenAt: now - 60_000,
    isActive: true,
    trustLevel: 80,
  };
  const demoDevice2: PairedDevice = {
    deviceId: 'demo-tablet-1',
    deviceInfo: {
      deviceId: 'demo-tablet-1',
      deviceName: 'iPad Pro',
      deviceType: 'tablet',
      osName: 'iPadOS',
      osVersion: '17.4',
      appVersion: '1.0.0',
    },
    pairedAt: now - 86400_000,
    lastSeenAt: now - 86400_000,
    isActive: false,
    trustLevel: 50,
  };
  pairedDevices.set(demoDevice1.deviceId, demoDevice1);
  pairedDevices.set(demoDevice2.deviceId, demoDevice2);

  const demoSession: PairingSession = {
    sessionId: 'demo-session-1',
    state: 'expired',
    localDevice,
    pairingMethod: 'manual-code',
    createdAt: now - 86400_000,
    updatedAt: now - 86000_000,
    expiresAt: now - 86000_000,
  };
  pairingSessions.set(demoSession.sessionId, demoSession);
}

seedDemoData();

// ===================== 路由实现 =====================

/**
 * POST /api/pairing/generate-code — 生成 6 位配对码
 *
 * 返回：{ code, expiresAt, createdAt, ttlMs }
 */
router.post('/generate-code', (_req: Request, res: Response) => {
  try {
    const info = codeGenerator.generate(localDevice.deviceId);
    currentCode = info;
    logger.info(`[PairingRoute] 生成配对码 ${info.code}（有效期至 ${new Date(info.expiresAt).toISOString()})`);

    // 同时创建一个 waiting 状态的会话，便于会话列表展示
    const sessionId = `sess-${randomUUID()}`;
    const session: PairingSession = {
      sessionId,
      state: 'idle',
      localDevice,
      pairingMethod: 'manual-code',
      pairingCode: info,
      createdAt: info.createdAt,
      updatedAt: info.createdAt,
      expiresAt: info.expiresAt,
    };
    pairingSessions.set(sessionId, session);

    res.json({
      code: info.code,
      createdAt: info.createdAt,
      expiresAt: info.expiresAt,
      ttlMs: codeGenerator.getTtlMs(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[PairingRoute] 生成配对码失败: ${msg}`);
    res.status(500).json({ error: `生成配对码失败: ${msg}` });
  }
});

/**
 * GET /api/pairing/sessions — 获取配对会话列表
 *
 * 返回：{ sessions: PairingSession[] }
 */
router.get('/sessions', (_req: Request, res: Response) => {
  try {
    // 同步会话状态：根据过期时间自动标记 expired
    const now = Date.now();
    for (const session of pairingSessions.values()) {
      if (
        session.state !== 'paired' &&
        session.state !== 'failed' &&
        session.expiresAt &&
        now > session.expiresAt &&
        session.state !== 'expired'
      ) {
        session.state = 'expired';
        session.updatedAt = now;
      }
    }
    const sessions = Array.from(pairingSessions.values()).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    res.json({ sessions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `获取会话列表失败: ${msg}` });
  }
});

/**
 * GET /api/pairing/devices — 获取已配对设备列表
 *
 * 返回：{ devices: PairedDevice[] }
 */
router.get('/devices', (_req: Request, res: Response) => {
  try {
    const devices = Array.from(pairedDevices.values()).sort(
      (a, b) => b.pairedAt - a.pairedAt,
    );
    res.json({ devices });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `获取已配对设备列表失败: ${msg}` });
  }
});

/**
 * DELETE /api/pairing/devices/:id — 取消配对（移除已配对设备）
 *
 * 返回：{ success: boolean }
 */
router.delete('/devices/:id', (req: Request, res: Response) => {
  try {
    const deviceId = req.params.id;
    if (!deviceId) {
      res.status(400).json({ error: '缺少设备 ID' });
      return;
    }
    const removed = pairedDevices.delete(deviceId);
    if (!removed) {
      res.status(404).json({ error: `未找到设备: ${deviceId}` });
      return;
    }
    logger.info(`[PairingRoute] 已取消配对: ${deviceId}`);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `取消配对失败: ${msg}` });
  }
});

/**
 * POST /api/pairing/discover — 扫描附近可配对设备
 *
 * Body（可选）: { timeoutMs?: number }
 * 返回：{ devices: DiscoveredDevice[] }
 */
router.post('/discover', (req: Request, res: Response) => {
  try {
    const timeoutMs = Number(req.body?.timeoutMs) || 5000;

    // 当前实现：生成一组示例发现设备（真实场景应接入 PairingDiscovery + mDNS/SSDP）
    const now = Date.now();
    const seed: DiscoveredDevice[] = [
      {
        deviceId: 'nearby-device-1',
        deviceName: 'Galaxy S24',
        address: '192.168.1.42:8765',
        transport: 'tcp',
        signalStrength: 85,
        lastSeen: now,
        serviceName: 'cross-wms-pairing',
      },
      {
        deviceId: 'nearby-device-2',
        deviceName: 'MacBook Pro',
        address: '192.168.1.51:8765',
        transport: 'tcp',
        signalStrength: 72,
        lastSeen: now,
        serviceName: 'cross-wms-pairing',
      },
      {
        deviceId: 'nearby-device-3',
        deviceName: 'Surface Pro',
        address: '192.168.1.63:8765',
        transport: 'tcp',
        signalStrength: 58,
        lastSeen: now,
        serviceName: 'cross-wms-pairing',
      },
    ];
    discoveredDevices = seed;
    logger.info(`[PairingRoute] 设备发现完成（超时 ${timeoutMs}ms），共 ${seed.length} 个设备`);
    res.json({ devices: discoveredDevices });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `设备发现失败: ${msg}` });
  }
});

export default router;
