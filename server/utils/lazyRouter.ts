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

/**
 * 创建延迟加载的 Express Router
 *
 * @param importFn 动态 import 函数
 * @param selector 从模块中选取 Router（默认取 .default）
 * @param label 可选标签，用于日志
 */
export function lazyRouter<T extends AnyExport = DefaultExport>(
  importFn: () => Promise<T>,
  selector?: (mod: T) => Router,
  label?: string,
): Router {
  const router = Router();
  let cached: Router | null = null;
  let loading: Promise<Router> | null = null;

  const resolveRouter = (mod: T): Router => {
    if (selector) return selector(mod);
    if ('default' in mod) return mod.default;
    // 如果没有 default 导出，取第一个 Router 值
    const first = Object.values(mod)[0];
    return first as Router;
  };

  router.use((req: Request, res: Response, next: NextFunction) => {
    if (cached) {
      return cached(req, res, next);
    }

    if (!loading) {
      const tag = label || req.path;
      loading = importFn().then(mod => {
        cached = resolveRouter(mod);
        logger.debug(`[LazyRouter] "${tag}" 已延迟加载`);
        loading = null;
        return cached;
      }).catch(err => {
        loading = null;
        logger.error(`[LazyRouter] "${tag}" 加载失败:`, err);
        throw err;
      });
    }

    loading
      .then(r => r(req, res, next))
      .catch(next);
  });

  return router;
}
