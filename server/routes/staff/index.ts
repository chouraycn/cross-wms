/**
 * StaffDeck Routes — 统一注册入口
 *
 * 使用方式（在 server/index.ts 启动流程中）：
 *   import { registerStaffRoutes } from './routes/staff/index.js';
 *   registerStaffRoutes(app);
 *
 * 所有路由统一挂载到 /api/staffdeck/* 前缀下，与 cross-wms 既有 /api/* 路由完全隔离。
 * 路由模块按需 lazy load，避免影响启动时间。
 */
import type { Express } from 'express';
import { lazyRouter } from '../../utils/lazyRouter.js';

export function registerStaffRoutes(app: Express): void {
  app.use('/api/staffdeck/agents', lazyRouter(() => import('./agents.js'), undefined, 'staff-agents'));
  app.use('/api/staffdeck/skills', lazyRouter(() => import('./skills.js'), undefined, 'staff-skills'));
  app.use(
    '/api/staffdeck/general-skills',
    lazyRouter(() => import('./generalSkills.js'), undefined, 'staff-general-skills'),
  );
  app.use(
    '/api/staffdeck/knowledge-bases',
    lazyRouter(() => import('./knowledgeBases.js'), undefined, 'staff-knowledge-bases'),
  );
  app.use(
    '/api/staffdeck/knowledge',
    lazyRouter(() => import('./knowledge.js'), undefined, 'staff-knowledge'),
  );
  app.use('/api/staffdeck/chat', lazyRouter(() => import('./chatStream.js'), undefined, 'staff-chat'));
}
