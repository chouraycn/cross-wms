/**
 * File Transfer Tool Extension
 *
 * 成对节点文件交换的传输队列管理。通过 ExtensionBridge 注册真实可调用工具，
 * Agent 启用本扩展后即可调用以下工具：
 *   - file_transfer_queue     将本地文件加入传输队列（校验大小/根目录白名单）
 *   - file_transfer_list      列出队列中的传输任务
 *   - file_transfer_complete  标记传输任务完成（可选执行本地复制到目标目录）
 *   - file_transfer_cancel    取消传输任务
 *
 * 通过 allowedRoots 白名单限制可操作的根目录，maxBytes 限制单文件大小。
 * 纯本地实现，无外部依赖。
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';
import fs from 'node:fs';
import path from 'node:path';

const manifest: ExtensionManifest = {
  id: 'file-transfer',
  name: 'File Transfer Tool',
  description: 'File transfer tool extension for paired node file exchange',
  version: '1.0.0',
  kind: 'tool',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

interface TransferTask {
  id: string;
  sourcePath: string;
  targetPath: string;
  status: 'queued' | 'completed' | 'failed' | 'cancelled';
  size: number;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

const queue = new Map<string, TransferTask>();

function isUnderRoots(p: string, roots: string[]): boolean {
  if (roots.length === 0) return true; // 未配置白名单则放行
  const resolved = path.resolve(p);
  return roots.some((r) => {
    const rr = path.resolve(r);
    return resolved === rr || resolved.startsWith(rr + path.sep);
  });
}

export default class FileTransferTool implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering File Transfer tool extension');

    const maxBytes = (context.config['maxBytes'] as number) || 104857600;
    const allowedRoots = (context.config['allowedRoots'] as string[]) || [];

    context.logger.info(`File Transfer tool registered with maxBytes=${maxBytes}, roots=${allowedRoots.length}`);

    // file_transfer_queue：加入传输队列
    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'file_transfer_queue',
          description: '将本地文件加入传输队列，校验文件存在、大小及根目录白名单。',
          parameters: {
            type: 'object',
            properties: {
              sourcePath: { type: 'string', description: '源文件绝对路径' },
              targetPath: { type: 'string', description: '目标路径（可为目录或完整文件路径）' },
            },
            required: ['sourcePath', 'targetPath'],
          },
        },
      },
      async (args) => {
        const sourcePath = String(args.sourcePath ?? '');
        const targetPath = String(args.targetPath ?? '');
        if (!sourcePath || !targetPath) return JSON.stringify({ error: 'sourcePath 与 targetPath 不能为空' });
        if (!isUnderRoots(sourcePath, allowedRoots)) return JSON.stringify({ error: 'sourcePath 不在允许的根目录内' });
        let stat: fs.Stats;
        try {
          stat = fs.statSync(sourcePath);
        } catch (e) {
          return JSON.stringify({ error: `源文件不存在: ${(e as Error).message}` });
        }
        if (!stat.isFile()) return JSON.stringify({ error: 'sourcePath 不是文件' });
        if (stat.size > maxBytes) return JSON.stringify({ error: `文件过大: ${stat.size} > ${maxBytes}` });
        const id = `ft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const task: TransferTask = {
          id,
          sourcePath,
          targetPath,
          status: 'queued',
          size: stat.size,
          createdAt: Date.now(),
        };
        queue.set(id, task);
        return JSON.stringify({ ok: true, id, status: task.status, size: task.size });
      },
    );

    // file_transfer_list：列出传输任务
    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'file_transfer_list',
          description: '列出传输队列中的任务，可按状态过滤',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', description: '状态过滤：queued/completed/failed/cancelled（可选）' },
            },
            required: [],
          },
        },
      },
      async (args) => {
        const status = args.status ? String(args.status) : '';
        let tasks = Array.from(queue.values());
        if (status) tasks = tasks.filter((t) => t.status === status);
        return JSON.stringify({
          ok: true,
          count: tasks.length,
          tasks: tasks.map((t) => ({
            id: t.id,
            sourcePath: t.sourcePath,
            targetPath: t.targetPath,
            status: t.status,
            size: t.size,
            error: t.error,
            createdAt: t.createdAt,
            completedAt: t.completedAt,
          })),
        });
      },
    );

    // file_transfer_complete：完成传输（执行本地复制）
    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'file_transfer_complete',
          description: '标记传输任务完成，并执行本地文件复制到目标路径（如目标为目录则保留原文件名）。',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '传输任务 id' },
            },
            required: ['id'],
          },
        },
      },
      async (args) => {
        const id = String(args.id ?? '');
        const task = queue.get(id);
        if (!task) return JSON.stringify({ error: `任务不存在: ${id}` });
        if (task.status === 'completed') return JSON.stringify({ ok: true, id, status: 'completed', note: 'already completed' });
        if (!isUnderRoots(task.targetPath, allowedRoots)) {
          task.status = 'failed';
          task.error = 'targetPath 不在允许的根目录内';
          return JSON.stringify({ ok: false, id, status: task.status, error: task.error });
        }
        try {
          let dest = task.targetPath;
          try {
            const dstat = fs.statSync(dest);
            if (dstat.isDirectory()) dest = path.join(dest, path.basename(task.sourcePath));
          } catch {
            // 目标不存在，按文件路径处理
          }
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(task.sourcePath, dest);
          task.status = 'completed';
          task.completedAt = Date.now();
          return JSON.stringify({ ok: true, id, status: task.status, copiedTo: dest });
        } catch (e) {
          task.status = 'failed';
          task.error = (e as Error).message;
          return JSON.stringify({ ok: false, id, status: task.status, error: task.error });
        }
      },
    );

    // file_transfer_cancel：取消传输
    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'file_transfer_cancel',
          description: '取消传输任务（仅对 queued 状态有效）',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '传输任务 id' },
            },
            required: ['id'],
          },
        },
      },
      async (args) => {
        const id = String(args.id ?? '');
        const task = queue.get(id);
        if (!task) return JSON.stringify({ error: `任务不存在: ${id}` });
        if (task.status === 'completed') return JSON.stringify({ ok: false, id, status: task.status, error: '已完成的任务不可取消' });
        task.status = 'cancelled';
        task.completedAt = Date.now();
        return JSON.stringify({ ok: true, id, status: task.status });
      },
    );
  }

  unregister(): void {
    console.log('Unregistering File Transfer tool extension');
  }
}
