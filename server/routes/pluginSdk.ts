/**
 * Plugin SDK API Routes — 统一插件运行时 (Plugin SDK) REST 接口
 *
 * 挂载路径: /api/plugin-sdk
 *
 * 与现有的 /api/plugins（DB-backed 安装管理器 engine/pluginRegistry.ts）互补：
 * 本路由暴露 engine/plugin-sdk 集群（统一运行时注册中心 + manifest 校验 + slots 槽位）。
 *
 * 接口列表：
 * - GET  /api/plugin-sdk/plugins — 列出已注册到统一运行时注册中心的插件
 * - POST /api/plugin-sdk/install — 校验 / 注册插件（manifest 校验 + 可选动态加载 entry）
 * - GET  /api/plugin-sdk/slots   — 列出插件槽位（slots）映射与默认槽位
 *
 * 纯内存 + 本地文件读取，无 db 依赖。
 */

import { Router, type Request, type Response } from 'express';
import path from 'path';
import {
  getUnifiedPluginRegistry,
} from '../engine/plugin-sdk/plugin-registry.js';
import {
  validateManifest,
  normalizeManifest,
  loadManifestFromPath,
  compareManifests,
  type PluginManifest,
} from '../engine/plugin-sdk/manifest.js';
import {
  slotKeysForPluginKind,
  defaultSlotIdForKey,
  applyExclusiveSlotSelection,
  type PluginSlotKey,
} from '../engine/plugin-sdk/slots.js';
import type {
  PluginCapabilityKind,
  PluginDefinition,
} from '../engine/plugin-sdk/types.js';
import { AppPaths } from '../config/appPaths.js';
import { logger } from '../logger.js';

const router = Router();

// 所有能力 kind（用于 slots 映射展示）
const ALL_KINDS: PluginCapabilityKind[] = [
  'tool', 'provider', 'embedding-provider', 'memory-host',
  'channel', 'hook', 'command', 'service',
];

const SLOT_KEYS: PluginSlotKey[] = ['memory', 'contextEngine'];

// ===================== GET /api/plugin-sdk/plugins =====================

/**
 * 列出已注册到统一插件运行时注册中心的插件
 */
router.get('/plugins', (_req: Request, res: Response) => {
  try {
    const registry = getUnifiedPluginRegistry();
    const ids = registry.listPluginIds();
    const health = registry.getHealth();
    const stats = registry.getStats();

    const plugins = ids.map((id) => {
      const runtime = registry.getRuntime(id);
      if (!runtime) {
        return { id, status: 'unknown', name: id, capabilities: [] as string[] };
      }
      return {
        id,
        status: runtime.status,
        name: runtime.definition.name,
        capabilities: runtime.capabilities.map((c) => c.kind),
        activatedAt: runtime.activatedAt ?? null,
      };
    });

    res.json({
      success: true,
      data: {
        plugins,
        stats,
        health,
      },
    });
  } catch (e) {
    logger.error('[PluginSdk API] plugins error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ===================== POST /api/plugin-sdk/install =====================

/**
 * 校验并（可选地）安装插件
 *
 * Body（两种方式，可组合）：
 *   1. { manifest: object }           — 仅校验 + 规范化 manifest
 *   2. { manifest: object, entryPath: string, activate?: boolean }
 *        — 在 manifest 校验通过后，从 entryPath 动态加载插件入口
 *          （entryPath 必须是 AppPaths.pluginsDir 之内的 .js 文件），
 *          调用 registerDefinition() 注册到统一运行时注册中心，
 *          激活后通过 activate() 触发 onActivate 钩子。
 */
router.post('/install', async (req: Request, res: Response) => {
  try {
    const { manifest, entryPath, activate, config } = req.body as {
      manifest?: unknown;
      entryPath?: string;
      activate?: boolean;
      config?: Record<string, unknown>;
    };

    if (manifest === undefined && !entryPath) {
      res.status(400).json({
        success: false,
        error: 'Either "manifest" or "entryPath" is required',
      });
      return;
    }

    // 1. manifest 校验（若提供）
    let normalized: PluginManifest | undefined;
    if (manifest !== undefined) {
      const validation = validateManifest(manifest);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: 'Manifest validation failed',
          details: validation.errors,
          warnings: validation.warnings,
        });
        return;
      }
      normalized = normalizeManifest(validation.manifest!);
    }

    // 2. 若未提供 entryPath，仅返回规范化 manifest（纯校验模式）
    if (!entryPath) {
      res.json({ success: true, data: { manifest: normalized, registered: false } });
      return;
    }

    // 3. 路径安全：必须在 pluginsDir 之内
    const resolved = path.resolve(entryPath);
    const pluginsRoot = path.resolve(AppPaths.pluginsDir);
    if (resolved !== pluginsRoot && !resolved.startsWith(pluginsRoot + path.sep)) {
      res.status(400).json({
        success: false,
        error: 'entryPath must be located within the plugins directory',
      });
      return;
    }
    if (!resolved.endsWith('.js')) {
      res.status(400).json({ success: false, error: 'entryPath must be a .js file' });
      return;
    }

    // 4. 动态加载插件入口（默认导出应为 PluginDefinition）
    let mod: { default?: PluginDefinition } & Record<string, unknown>;
    try {
      mod = (await import(resolved)) as { default?: PluginDefinition } & Record<string, unknown>;
    } catch (err) {
      res.status(400).json({
        success: false,
        error: `Failed to load entry: ${(err as Error).message}`,
      });
      return;
    }

    const definition = (mod.default ?? mod) as PluginDefinition;
    if (!definition || typeof definition.register !== 'function') {
      res.status(400).json({ success: false, error: 'Entry does not export a valid PluginDefinition' });
      return;
    }

    const registry = getUnifiedPluginRegistry();
    const registered = await registry.registerDefinition(definition, config ?? {});
    if (!registered) {
      res.status(500).json({ success: false, error: 'registerDefinition returned false' });
      return;
    }

    let activated = false;
    if (activate) {
      activated = await registry.activate(definition.id);
    }

    res.status(201).json({
      success: true,
      data: {
        pluginId: definition.id,
        registered: true,
        activated,
        manifest: normalized,
      },
    });
  } catch (e) {
    logger.error('[PluginSdk API] install error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ===================== GET /api/plugin-sdk/slots =====================

/**
 * 列出插件槽位（slots）映射
 *
 * Query: ?kind=tool   — 仅返回该能力 kind 对应的槽位
 */
router.get('/slots', (req: Request, res: Response) => {
  try {
    const kind = req.query.kind as PluginCapabilityKind | undefined;

    const defaultSlots: Record<PluginSlotKey, string> = {
      memory: defaultSlotIdForKey('memory'),
      contextEngine: defaultSlotIdForKey('contextEngine'),
    };

    const mapping: Record<string, PluginSlotKey[]> = {};
    if (kind) {
      mapping[kind] = slotKeysForPluginKind(kind);
    } else {
      for (const k of ALL_KINDS) {
        mapping[k] = slotKeysForPluginKind(k);
      }
    }

    // 演示排他槽位选择（以 kind 推断；未指定 kind 时返回默认，无变化）
    const selection = kind
      ? applyExclusiveSlotSelection({
          currentSlots: defaultSlots,
          selectedId: `demo-${kind}`,
          selectedKind: kind,
        })
      : { slots: defaultSlots, warnings: [], changed: false };

    res.json({
      success: true,
      data: {
        slotKeys: SLOT_KEYS,
        defaultSlots,
        kindToSlotMapping: mapping,
        selectionDemo: selection,
      },
    });
  } catch (e) {
    logger.error('[PluginSdk API] slots error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ===================== 工具端点：manifest 校验（按文件路径） =====================

/**
 * POST /api/plugin-sdk/validate-manifest
 * 从磁盘路径加载并校验 manifest（exercise manifest.loadManifestFromPath / compareManifests）
 *
 * Body: { path: string }
 */
router.post('/validate-manifest', (req: Request, res: Response) => {
  try {
    const { manifestPath, baseline } = req.body as { manifestPath?: string; baseline?: unknown };
    if (!manifestPath || typeof manifestPath !== 'string') {
      res.status(400).json({ success: false, error: 'manifestPath is required' });
      return;
    }

    const result = loadManifestFromPath(manifestPath);
    let diff: { changed: boolean; diffs: string[] } | undefined;
    if (result.valid && result.manifest && baseline) {
      const baseValidation = validateManifest(baseline);
      if (baseValidation.valid && baseValidation.manifest) {
        diff = compareManifests(baseValidation.manifest, result.manifest);
      }
    }

    res.json({ success: true, data: { ...result, diff } });
  } catch (e) {
    logger.error('[PluginSdk API] validate-manifest error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

export default router;
