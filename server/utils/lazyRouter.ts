/**
 * 延迟加载路由器 — 参照 openclaw gateway/server.ts 轻量入口设计
 *
 * 核心思想：
 * - 路由模块在首次请求时才动态 import，减少启动时间
 * - 加载后缓存 Router 实例，后续请求直接复用
 * - 支持命名导出和默认导出
 *
 * 使用方式：
 *   // 替代: import pdfRouter from './routes/pdf.js';
 *   //        app.use('/api/pdf', pdfRouter);
 *   app.use('/api/pdf', lazyRouter(() => import('./routes/pdf.js')));
 *
 *   // 命名导出:
 *   app.use('/api/ctx', lazyRouter(() => import('./routes/contextEngine.js'), m => m.contextEngineRouter));
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { logger } from '../logger.js';

type DefaultExport = { default: Router };
type NamedExport = { [key: string]: Router };
type AnyExport = DefaultExport | NamedExport;

const loadedModules = new Map<string, Router>();
const pendingLoads = new Map<string, Promise<Router>>();
const routeImportFns = new Map<string, () => Promise<AnyExport>>();
const routeSelectors = new Map<string, ((mod: AnyExport) => Router) | undefined>();

let warmupInProgress = false;

const WARMUP_GROUPS: Record<string, string[]> = {
  chat: ['sessions', 'folders', 'skills', 'models', 'memory'],
  skills: ['skill-chains', 'triggers', 'matching', 'plugins'],
  warehouses: ['inventory', 'transit', 'partners', 'inventory-transactions'],
  settings: ['models', 'mcp', 'secrets', 'permissions'],
  plugins: ['extensions', 'webhook', 'channels', 'automation'],
};

/**
 * 创建延迟加载的 Express Router
 *
 * @param importFn 动态 import 函数
 * @param selector 从模块中选取 Router（默认取 .default）
 * @param label 可选标签，用于日志和预热
 */
export function lazyRouter<T extends AnyExport = DefaultExport>(
  importFn: () => Promise<T>,
  selector?: (mod: T) => Router,
  label?: string,
): Router {
  const router = Router();
  const key = label || 'unknown';

  routeImportFns.set(key, importFn as () => Promise<AnyExport>);
  routeSelectors.set(key, selector as ((mod: AnyExport) => Router) | undefined);

  const resolveRouter = (mod: T): Router => {
    if (selector) return selector(mod);
    if ('default' in mod) return mod.default;
    const first = Object.values(mod)[0];
    return first as Router;
  };

  router.use((req: Request, res: Response, next: NextFunction) => {
    if (loadedModules.has(key)) {
      return loadedModules.get(key)!(req, res, next);
    }

    if (!pendingLoads.has(key)) {
      pendingLoads.set(
        key,
        importFn().then(mod => {
          const r = resolveRouter(mod);
          loadedModules.set(key, r);
          logger.debug(`[LazyRouter] "${key}" 已延迟加载`);
          pendingLoads.delete(key);

          // 首次加载后触发后台预热
          triggerWarmup(key);

          return r;
        }).catch(err => {
          pendingLoads.delete(key);
          logger.error(`[LazyRouter] "${key}" 加载失败:`, err);
          throw err;
        }),
      );
    }

    pendingLoads
      .get(key)!
      .then(r => r(req, res, next))
      .catch(next);
  });

  return router;
}

// ============ 路由预热机制 ============

function triggerWarmup(triggerKey: string): void {
  if (warmupInProgress) return;

  const group = Object.entries(WARMUP_GROUPS).find(([matchKey]) =>
    triggerKey.includes(matchKey),
  );

  if (!group) return;

  const [, routesToWarmup] = group;
  warmupInProgress = true;

  logger.debug(`[LazyRouter] 开始预热路由组: ${routesToWarmup.join(', ')}`);

  let index = 0;
  const warmupNext = () => {
    if (index >= routesToWarmup.length) {
      warmupInProgress = false;
      logger.debug('[LazyRouter] 路由预热完成');
      return;
    }

    const routeKey = routesToWarmup[index++];
    if (loadedModules.has(routeKey) || pendingLoads.has(routeKey)) {
      setImmediate(warmupNext);
      return;
    }

    const importFn = routeImportFns.get(routeKey);
    const selector = routeSelectors.get(routeKey);
    if (!importFn) {
      setImmediate(warmupNext);
      return;
    }

    // 每个路由间隔 50ms 加载，避免阻塞事件循环
    setTimeout(() => {
      importFn()
        .then(mod => {
          const router = selector
            ? selector(mod)
            : ('default' in mod ? (mod as DefaultExport).default : (Object.values(mod)[0] as Router));
          loadedModules.set(routeKey, router);
          logger.debug(`[LazyRouter] 预热完成: ${routeKey}`);
        })
        .catch(() => {
          logger.debug(`[LazyRouter] 预热跳过: ${routeKey}`);
        })
        .finally(warmupNext);
    }, 50);
  };

  setImmediate(warmupNext);
}

/** 检查路由是否已加载 */
export function isRouteLoaded(key: string): boolean {
  return loadedModules.has(key);
}

/** 获取已加载的路由数量（用于性能监控） */
export function getLoadedRouteCount(): number {
  return loadedModules.size;
}
