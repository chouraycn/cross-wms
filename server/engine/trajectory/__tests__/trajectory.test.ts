/**
 * 轨迹系统综合测试
 * 覆盖类型定义、路径管理、导出、清理、元数据、回放、运行时管理等功能。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  safeTrajectorySessionFileName,
  resolveTrajectoryPath,
  resolveTrajectoryFilePath,
  resolveTrajectoryRootDir,
  resolveMetadataFilePath,
  generateArchiveFileName,
  TrajectoryExporter,
  createTrajectoryExporter,
  TrajectoryCleanupManager,
  createTrajectoryCleanupManager,
  TrajectoryMetadataManager,
  createTrajectoryMetadataManager,
  createReplayController,
  toTrajectoryToolDefinitions,
  TrajectoryRecorder,
} from '../index.js';
import {
  limitTrajectoryPayloadValue,
} from '../runtime.js';
import {
  parseTrajectoryJsonl,
  validateTrajectoryRuntimeFile,
  readTrajectoryEvents,
  isRegularNonSymlinkFile,
} from '../runtime-file.js';
import {
  TrajectoryCommandExporter,
} from '../command-export.js';
import type {
  TrajectoryEvent,
  CleanupPolicy,
} from '../types.js';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-wms-trajectory-'));
let tempDirId = 0;

function makeTempDir(): string {
  const dir = path.join(tempRoot, `case-${tempDirId++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createTestEvents(count: number, startSeq = 1): TrajectoryEvent[] {
  const events: TrajectoryEvent[] = [];
  const types = ['user.message', 'assistant.message', 'tool.call', 'tool.result', 'thinking', 'error'];
  const baseTime = new Date('2026-04-01T00:00:00.000Z').getTime();

  for (let i = 0; i < count; i++) {
    const seq = startSeq + i;
    const type = types[i % types.length]!;
    events.push({
      traceSchema: 'cdf-know-trajectory',
      schemaVersion: 1,
      traceId: 'test-session',
      source: 'runtime',
      type,
      ts: new Date(baseTime + i * 1000).toISOString(),
      seq,
      sessionId: 'test-session',
      data: {
        content: `Event ${seq} content`,
        toolName: type.startsWith('tool') ? 'bash' : undefined,
        success: type === 'tool.result',
      },
    });
  }
  return events;
}

function writeTrajectoryFile(filePath: string, events: TrajectoryEvent[]): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = events.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(filePath, content, 'utf8');
}

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('paths.ts - 路径管理', () => {
  it('safeTrajectorySessionFileName 应清理特殊字符', () => {
    expect(safeTrajectorySessionFileName('normal-session_123')).toBe('normal-session_123');
    expect(safeTrajectorySessionFileName('../evil/path')).toBe('___evil_path');
    expect(safeTrajectorySessionFileName('a'.repeat(200))).toHaveLength(120);
    expect(safeTrajectorySessionFileName('!!!')).toBe('session');
  });

  it('resolveTrajectoryPath 应返回完整路径结构', () => {
    const paths = resolveTrajectoryPath('test-session', { HOME: '/tmp/test-home' });
    expect(paths.rootDir).toContain('.cdf-know');
    expect(paths.sessionDir).toContain('test-session');
    expect(paths.entryFile.endsWith('.jsonl')).toBe(true);
    expect(paths.metadataFile.endsWith('metadata.json')).toBe(true);
    expect(paths.archiveDir).toContain('archive');
  });

  it('resolveTrajectoryFilePath 应支持环境变量覆盖', () => {
    const customDir = '/tmp/custom-trajectories';
    const filePath = resolveTrajectoryFilePath({
      env: { CDF_TRAJECTORY_DIR: customDir },
      sessionId: 'test-session',
    });
    expect(filePath.startsWith(customDir)).toBe(true);
    expect(filePath.endsWith('.jsonl')).toBe(true);
  });

  it('resolveTrajectoryRootDir 应正确解析根目录', () => {
    const dir = resolveTrajectoryRootDir({ HOME: '/tmp/home' });
    expect(dir).toContain('.cdf-know');
    expect(dir).toContain('trajectories');
  });

  it('resolveMetadataFilePath 应返回正确的元数据路径', () => {
    const metaPath = resolveMetadataFilePath('test-session', { HOME: '/tmp/home' });
    expect(metaPath.endsWith('metadata.json')).toBe(true);
  });

  it('generateArchiveFileName 应生成带时间戳的归档文件名', () => {
    const name = generateArchiveFileName('test-session');
    expect(name).toContain('test-session');
    expect(name).toContain('.tar.gz');
  });
});

describe('export.ts - 导出功能', () => {
  it('应导出为 JSONL 格式', async () => {
    const tmpDir = makeTempDir();
    const inputPath = path.join(tmpDir, 'input.jsonl');
    const outputPath = path.join(tmpDir, 'output.jsonl');
    const events = createTestEvents(5);
    writeTrajectoryFile(inputPath, events);

    const exporter = new TrajectoryExporter(inputPath);
    const result = await exporter.export(outputPath, { format: 'jsonl' });

    expect(result.eventCount).toBe(5);
    expect(result.format).toBe('jsonl');
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  it('应导出为 JSON 格式（带元数据的对象）', async () => {
    const tmpDir = makeTempDir();
    const inputPath = path.join(tmpDir, 'input.jsonl');
    const outputPath = path.join(tmpDir, 'output.json');
    const events = createTestEvents(3);
    writeTrajectoryFile(inputPath, events);

    const exporter = new TrajectoryExporter(inputPath);
    const result = await exporter.export(outputPath, { format: 'json', prettyPrint: true, includeMetadata: true });

    expect(result.eventCount).toBe(3);
    expect(result.format).toBe('json');
    const content = fs.readFileSync(outputPath, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.exportedAt).toBeDefined();
    expect(parsed.eventCount).toBe(3);
    expect(Array.isArray(parsed.events)).toBe(true);
    expect(parsed.events).toHaveLength(3);
    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata.typeCounts).toBeDefined();
  });

  it('应导出为 Markdown 格式', async () => {
    const tmpDir = makeTempDir();
    const inputPath = path.join(tmpDir, 'input.jsonl');
    const outputPath = path.join(tmpDir, 'output.md');
    const events = createTestEvents(4);
    writeTrajectoryFile(inputPath, events);

    const exporter = new TrajectoryExporter(inputPath);
    const result = await exporter.export(outputPath, { format: 'markdown' });

    expect(result.eventCount).toBe(4);
    expect(result.format).toBe('markdown');
    const content = fs.readFileSync(outputPath, 'utf8');
    expect(content).toContain('# Trajectory Export');
    expect(content).toContain('## Events');
  });

  it('应导出为 HTML 格式', async () => {
    const tmpDir = makeTempDir();
    const inputPath = path.join(tmpDir, 'input.jsonl');
    const outputPath = path.join(tmpDir, 'output.html');
    const events = createTestEvents(3);
    writeTrajectoryFile(inputPath, events);

    const exporter = new TrajectoryExporter(inputPath);
    const result = await exporter.export(outputPath, { format: 'html' });

    expect(result.eventCount).toBe(3);
    expect(result.format).toBe('html');
    const content = fs.readFileSync(outputPath, 'utf8');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('<title>Trajectory Export</title>');
    expect(content).toContain('</html>');
  });

  it('应按类型过滤事件', async () => {
    const tmpDir = makeTempDir();
    const inputPath = path.join(tmpDir, 'input.jsonl');
    const outputPath = path.join(tmpDir, 'output.jsonl');
    const events = createTestEvents(10);
    writeTrajectoryFile(inputPath, events);

    const exporter = new TrajectoryExporter(inputPath);
    const result = await exporter.export(outputPath, {
      format: 'jsonl',
      filterByType: ['tool.call', 'tool.result'],
    });

    expect(result.eventCount).toBeLessThan(10);
    expect(result.eventCount).toBeGreaterThan(0);
  });

  it('应排除指定类型的事件', async () => {
    const tmpDir = makeTempDir();
    const inputPath = path.join(tmpDir, 'input.jsonl');
    const outputPath = path.join(tmpDir, 'output.jsonl');
    const events = createTestEvents(10);
    writeTrajectoryFile(inputPath, events);

    const exporter = new TrajectoryExporter(inputPath);
    const result = await exporter.export(outputPath, {
      format: 'jsonl',
      excludeTypes: ['thinking'],
    });

    const outputContent = fs.readFileSync(outputPath, 'utf8');
    expect(outputContent).not.toContain('"type":"thinking"');
    expect(result.eventCount).toBeLessThan(10);
  });

  it('应按时间范围过滤事件', async () => {
    const tmpDir = makeTempDir();
    const inputPath = path.join(tmpDir, 'input.jsonl');
    const outputPath = path.join(tmpDir, 'output.jsonl');
    const events = createTestEvents(10);
    writeTrajectoryFile(inputPath, events);

    const exporter = new TrajectoryExporter(inputPath);
    const result = await exporter.export(outputPath, {
      format: 'jsonl',
      startTime: new Date('2026-04-01T00:00:03.000Z'),
      endTime: new Date('2026-04-01T00:00:07.000Z'),
    });

    expect(result.eventCount).toBeLessThan(10);
    expect(result.eventCount).toBeGreaterThan(0);
  });

  it('应限制最大事件数', async () => {
    const tmpDir = makeTempDir();
    const inputPath = path.join(tmpDir, 'input.jsonl');
    const outputPath = path.join(tmpDir, 'output.jsonl');
    const events = createTestEvents(20);
    writeTrajectoryFile(inputPath, events);

    const exporter = new TrajectoryExporter(inputPath);
    const result = await exporter.export(outputPath, {
      format: 'jsonl',
      maxEvents: 5,
    });

    expect(result.eventCount).toBe(5);
  });

  it('createTrajectoryExporter 工厂函数应正常工作', () => {
    const tmpDir = makeTempDir();
    const inputPath = path.join(tmpDir, 'input.jsonl');
    fs.writeFileSync(inputPath, '', 'utf8');
    const exporter = createTrajectoryExporter(inputPath);
    expect(exporter).toBeInstanceOf(TrajectoryExporter);
  });
});

describe('cleanup.ts - 清理功能', () => {
  function createTestSession(
    dir: string,
    sessionId: string,
    eventCount: number,
    daysOld: number,
  ): void {
    const sessionDir = path.join(dir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    const trajectoryFile = path.join(sessionDir, 'trajectory.jsonl');
    const events = createTestEvents(eventCount);
    writeTrajectoryFile(trajectoryFile, events);

    const metadataFile = path.join(sessionDir, 'metadata.json');
    const oldTime = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const metadata = {
      sessionId,
      createdAt: oldTime.toISOString(),
      eventCount,
      tags: [] as string[],
    };
    fs.writeFileSync(metadataFile, JSON.stringify(metadata), 'utf8');

    fs.utimesSync(trajectoryFile, oldTime, oldTime);
    fs.utimesSync(metadataFile, oldTime, oldTime);
  }

  it('应列出所有会话', async () => {
    const tmpDir = makeTempDir();
    createTestSession(tmpDir, 'session-1', 10, 1);
    createTestSession(tmpDir, 'session-2', 5, 2);

    const manager = new TrajectoryCleanupManager(tmpDir);
    const sessions = await manager.listSessions();

    expect(sessions.length).toBe(2);
    expect(sessions.map(s => s.sessionId).sort()).toEqual(['session-1', 'session-2']);
  });

  it('应按年龄策略清理旧会话', async () => {
    const tmpDir = makeTempDir();
    createTestSession(tmpDir, 'old-session', 10, 30);
    createTestSession(tmpDir, 'new-session', 5, 1);

    const manager = new TrajectoryCleanupManager(tmpDir);
    const policy: CleanupPolicy = {
      type: 'age',
      maxAgeDays: 7,
      minSessionsToKeep: 0,
    };
    const result = await manager.executeCleanup(policy);

    expect(result.deletedSessions.length).toBe(1);
    expect(result.deletedSessions[0]).toBe('old-session');
  });

  it('应按数量策略清理，保留最新的 N 个', async () => {
    const tmpDir = makeTempDir();
    for (let i = 0; i < 10; i++) {
      createTestSession(tmpDir, `session-${i}`, 5, 10 - i);
    }

    const manager = new TrajectoryCleanupManager(tmpDir);
    const policy: CleanupPolicy = {
      type: 'count',
      maxSessionCount: 3,
      minSessionsToKeep: 3,
    };
    const result = await manager.executeCleanup(policy);

    expect(result.deletedSessions.length).toBe(7);
    const remaining = await manager.listSessions();
    expect(remaining.length).toBe(3);
  });

  it('应按大小策略清理', async () => {
    const tmpDir = makeTempDir();
    createTestSession(tmpDir, 'big-session', 100, 1);
    createTestSession(tmpDir, 'small-session', 5, 2);

    const manager = new TrajectoryCleanupManager(tmpDir);
    const usage = await manager.getDiskUsage();
    const policy: CleanupPolicy = {
      type: 'size',
      maxTotalBytes: Math.floor(usage.totalBytes / 2),
      minSessionsToKeep: 0,
    };
    const result = await manager.executeCleanup(policy);

    expect(result.deletedSessions.length).toBeGreaterThanOrEqual(1);
    expect(result.freedBytes).toBeGreaterThan(0);
  });

  it('dry-run 模式不应实际删除文件', async () => {
    const tmpDir = makeTempDir();
    createTestSession(tmpDir, 'old-session', 10, 30);

    const manager = new TrajectoryCleanupManager(tmpDir);
    const policy: CleanupPolicy = {
      type: 'age',
      maxAgeDays: 7,
      minSessionsToKeep: 0,
      dryRun: true,
    };
    const result = await manager.executeCleanup(policy);

    expect(result.deletedSessions.length).toBe(1);
    const sessions = await manager.listSessions();
    expect(sessions.length).toBe(1);
  });

  it('应保留带标签的会话', async () => {
    const tmpDir = makeTempDir();
    createTestSession(tmpDir, 'tagged-session', 10, 30);
    createTestSession(tmpDir, 'untagged-session', 5, 30);

    const taggedMetaPath = path.join(tmpDir, 'tagged-session', 'metadata.json');
    const taggedMeta = JSON.parse(fs.readFileSync(taggedMetaPath, 'utf8'));
    taggedMeta.tags = ['important'];
    fs.writeFileSync(taggedMetaPath, JSON.stringify(taggedMeta), 'utf8');

    const manager = new TrajectoryCleanupManager(tmpDir);
    const policy: CleanupPolicy = {
      type: 'age',
      maxAgeDays: 7,
      minSessionsToKeep: 0,
      preserveTags: ['important'],
    };
    const result = await manager.executeCleanup(policy);

    expect(result.deletedSessions.length).toBe(1);
    expect(result.deletedSessions[0]).toBe('untagged-session');
  });

  it('getDiskUsage 应返回正确的磁盘使用信息', async () => {
    const tmpDir = makeTempDir();
    createTestSession(tmpDir, 'session-1', 10, 1);

    const manager = new TrajectoryCleanupManager(tmpDir);
    const usage = await manager.getDiskUsage();

    expect(usage.totalBytes).toBeGreaterThan(0);
    expect(usage.sessionCount).toBe(1);
  });

  it('estimateCleanupImpact 应正确预估清理影响', async () => {
    const tmpDir = makeTempDir();
    createTestSession(tmpDir, 'old-session', 10, 30);
    createTestSession(tmpDir, 'new-session', 5, 1);

    const manager = new TrajectoryCleanupManager(tmpDir);
    const policy: CleanupPolicy = {
      type: 'age',
      maxAgeDays: 7,
      minSessionsToKeep: 0,
    };
    const estimate = await manager.estimateCleanupImpact(policy);

    expect(estimate.wouldDelete).toBe(1);
    expect(estimate.wouldFreeBytes).toBeGreaterThan(0);
  });

  it('createTrajectoryCleanupManager 工厂函数应正常工作', () => {
    const tmpDir = makeTempDir();
    const manager = createTrajectoryCleanupManager(tmpDir);
    expect(manager).toBeInstanceOf(TrajectoryCleanupManager);
  });
});

describe('metadata.ts - 元数据管理', () => {
  it('应从事件中提取元数据', async () => {
    const tmpDir = makeTempDir();
    const manager = new TrajectoryMetadataManager(tmpDir);
    const events = createTestEvents(10);
    const metadata = await manager.extractFromEvents(events, 'test-session');

    expect(metadata.sessionId).toBe('test-session');
    expect(metadata.eventCount).toBe(10);
    expect(metadata.errorCount).toBeGreaterThanOrEqual(0);
    expect(metadata.toolCallCount).toBeGreaterThanOrEqual(0);
  });

  it('应读取会话元数据', async () => {
    const tmpDir = makeTempDir();
    const sessionDir = path.join(tmpDir, 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    const trajectoryFile = path.join(sessionDir, 'trajectory.jsonl');
    const events = createTestEvents(5);
    writeTrajectoryFile(trajectoryFile, events);

    const manager = new TrajectoryMetadataManager(tmpDir);
    const meta = await manager.readSessionMetadata(sessionDir);

    expect(meta).not.toBeNull();
    expect(meta?.sessionId).toBe('test-session');
    expect(meta?.eventCount).toBe(5);
  });

  it('应更新会话元数据', async () => {
    const tmpDir = makeTempDir();
    const sessionDir = path.join(tmpDir, 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    const trajectoryFile = path.join(sessionDir, 'trajectory.jsonl');
    const events = createTestEvents(5);
    writeTrajectoryFile(trajectoryFile, events);

    const manager = new TrajectoryMetadataManager(tmpDir);
    const updated = await manager.updateSessionMetadata(sessionDir, {
      title: 'Updated Title',
      eventCount: 20,
    });

    expect(updated.title).toBe('Updated Title');
    expect(updated.eventCount).toBe(20);
  });

  it('应添加和移除标签', async () => {
    const tmpDir = makeTempDir();
    const sessionDir = path.join(tmpDir, 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    const trajectoryFile = path.join(sessionDir, 'trajectory.jsonl');
    const events = createTestEvents(5);
    writeTrajectoryFile(trajectoryFile, events);

    const manager = new TrajectoryMetadataManager(tmpDir);

    const withTags = await manager.addTags(sessionDir, ['important', 'debug']);
    expect(withTags.tags).toContain('important');
    expect(withTags.tags).toContain('debug');
    expect(withTags.tags?.length).toBe(2);

    const afterRemove = await manager.removeTags(sessionDir, ['debug']);
    expect(afterRemove.tags).toContain('important');
    expect(afterRemove.tags).not.toContain('debug');
  });

  it('应设置自定义字段', async () => {
    const tmpDir = makeTempDir();
    const sessionDir = path.join(tmpDir, 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    const trajectoryFile = path.join(sessionDir, 'trajectory.jsonl');
    const events = createTestEvents(5);
    writeTrajectoryFile(trajectoryFile, events);

    const manager = new TrajectoryMetadataManager(tmpDir);
    const updated = await manager.setCustomField(sessionDir, 'priority', 'high');

    expect(updated.customFields?.priority).toBe('high');
  });

  it('应搜索会话', async () => {
    const tmpDir = makeTempDir();
    const sessionDir1 = path.join(tmpDir, 'session-1');
    const sessionDir2 = path.join(tmpDir, 'session-2');
    fs.mkdirSync(sessionDir1, { recursive: true });
    fs.mkdirSync(sessionDir2, { recursive: true });

    writeTrajectoryFile(path.join(sessionDir1, 'trajectory.jsonl'), createTestEvents(10));
    writeTrajectoryFile(path.join(sessionDir2, 'trajectory.jsonl'), createTestEvents(3));

    const manager = new TrajectoryMetadataManager(tmpDir);
    const results = await manager.searchSessions({ minEventCount: 5 });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]?.eventCount).toBeGreaterThanOrEqual(5);
  });

  it('应获取目录摘要', async () => {
    const tmpDir = makeTempDir();
    const sessionDir1 = path.join(tmpDir, 'session-1');
    const sessionDir2 = path.join(tmpDir, 'session-2');
    fs.mkdirSync(sessionDir1, { recursive: true });
    fs.mkdirSync(sessionDir2, { recursive: true });

    writeTrajectoryFile(path.join(sessionDir1, 'trajectory.jsonl'), createTestEvents(10));
    writeTrajectoryFile(path.join(sessionDir2, 'trajectory.jsonl'), createTestEvents(5));

    const manager = new TrajectoryMetadataManager(tmpDir);
    const summary = await manager.getDirectorySummary();

    expect(summary.totalSessions).toBe(2);
    expect(summary.totalEvents).toBe(15);
  });

  it('createTrajectoryMetadataManager 工厂函数应正常工作', () => {
    const tmpDir = makeTempDir();
    const manager = createTrajectoryMetadataManager(tmpDir);
    expect(manager).toBeInstanceOf(TrajectoryMetadataManager);
  });
});

describe('replay.ts - 回放功能', () => {
  it('createReplayController 应创建回放控制器', () => {
    const events = createTestEvents(5);
    const controller = createReplayController(events);

    expect(controller.getTotal()).toBe(5);
    expect(controller.getIndex()).toBe(0);
    expect(controller.getCurrent()).not.toBeNull();
  });

  it('回放控制器应支持前进和后退', async () => {
    const events = createTestEvents(5);
    const controller = createReplayController(events);

    const next1 = await controller.next();
    expect(next1).not.toBeNull();
    expect(controller.getIndex()).toBe(1);

    const next2 = await controller.next();
    expect(next2).not.toBeNull();
    expect(controller.getIndex()).toBe(2);

    const prev = await controller.prev();
    expect(prev).not.toBeNull();
    expect(controller.getIndex()).toBe(1);
  });

  it('回放控制器应支持跳转到指定序号', async () => {
    const events = createTestEvents(10);
    const controller = createReplayController(events);

    const event = await controller.goTo(5);
    expect(event).not.toBeNull();
    expect(event?.seq).toBe(5);
    expect(controller.getIndex()).toBe(4);
  });

  it('回放控制器应支持暂停和恢复', () => {
    const events = createTestEvents(5);
    const controller = createReplayController(events);

    expect(controller.isPaused()).toBe(false);
    controller.pause();
    expect(controller.isPaused()).toBe(true);
    controller.resume();
    expect(controller.isPaused()).toBe(false);
  });

  it('回放控制器应支持停止（重置）', async () => {
    const events = createTestEvents(5);
    const controller = createReplayController(events);

    await controller.next();
    await controller.next();
    expect(controller.getIndex()).toBe(2);

    controller.stop();
    expect(controller.getIndex()).toBe(0);
    expect(controller.isPaused()).toBe(false);
  });

  it('回放控制器边界处理：首项无法后退', async () => {
    const events = createTestEvents(3);
    const controller = createReplayController(events);

    const prev = await controller.prev();
    expect(prev).toBeNull();
    expect(controller.getIndex()).toBe(0);
  });

  it('回放控制器边界处理：末项无法前进', async () => {
    const events = createTestEvents(3);
    const controller = createReplayController(events);

    await controller.next();
    await controller.next();
    const next = await controller.next();
    expect(next).toBeNull();
    expect(controller.getIndex()).toBe(2);
  });
});

describe('runtime.ts - 运行时管理', () => {
  it('limitTrajectoryPayloadValue 应限制字符串长度', () => {
    const longString = 'a'.repeat(100000);
    const result = limitTrajectoryPayloadValue(longString);

    expect(result).not.toBe(longString);
    expect(typeof result).toBe('object');
    expect((result as { truncated: boolean }).truncated).toBe(true);
  });

  it('limitTrajectoryPayloadValue 应处理对象', () => {
    const obj = {
      name: 'test',
      longField: 'x'.repeat(100000),
      nested: {
        deep: 'y'.repeat(100000),
      },
    };
    const result = limitTrajectoryPayloadValue(obj) as Record<string, unknown>;

    expect(result.name).toBe('test');
    expect(typeof result.longField).toBe('object');
    expect((result.longField as { truncated: boolean }).truncated).toBe(true);
  });

  it('limitTrajectoryPayloadValue 应处理数组', () => {
    const arr = [1, 'short', 'a'.repeat(100000), { key: 'value' }];
    const result = limitTrajectoryPayloadValue(arr) as unknown[];

    expect(result[0]).toBe(1);
    expect(result[1]).toBe('short');
    expect(typeof result[2]).toBe('object');
  });

  it('limitTrajectoryPayloadValue 应处理循环引用', () => {
    const obj: Record<string, unknown> = { name: 'test' };
    obj.self = obj;

    const result = limitTrajectoryPayloadValue(obj) as Record<string, unknown>;
    expect(result.name).toBe('test');
    expect(typeof result.self).toBe('object');
  });
});

describe('runtime-file.ts - 运行时文件解析', () => {
  it('parseTrajectoryJsonl 应解析有效的 JSONL 文件', async () => {
    const tmpDir = makeTempDir();
    const filePath = path.join(tmpDir, 'test.jsonl');
    const events = createTestEvents(5);
    writeTrajectoryFile(filePath, events);

    const result = await parseTrajectoryJsonl(filePath);

    expect(result.events.length).toBe(5);
    expect(result.invalidLines).toBe(0);
  });

  it('parseTrajectoryJsonl 应跳过无效行', async () => {
    const tmpDir = makeTempDir();
    const filePath = path.join(tmpDir, 'test.jsonl');
    const content = [
      JSON.stringify(createTestEvents(1)[0]),
      'invalid json',
      JSON.stringify(createTestEvents(1, 2)[0]),
      '',
    ].join('\n') + '\n';
    fs.writeFileSync(filePath, content, 'utf8');

    const result = await parseTrajectoryJsonl(filePath);

    expect(result.events.length).toBe(2);
    expect(result.invalidLines).toBeGreaterThan(0);
  });

  it('validateTrajectoryRuntimeFile 应验证有效文件', async () => {
    const tmpDir = makeTempDir();
    const filePath = path.join(tmpDir, 'test.jsonl');
    const events = createTestEvents(3);
    writeTrajectoryFile(filePath, events);

    const result = await validateTrajectoryRuntimeFile(filePath);

    expect(result.isValid).toBe(true);
    expect(result.eventCount).toBe(3);
  });

  it('validateTrajectoryRuntimeFile 应检测空文件', async () => {
    const tmpDir = makeTempDir();
    const filePath = path.join(tmpDir, 'empty.jsonl');
    fs.writeFileSync(filePath, '', 'utf8');

    const result = await validateTrajectoryRuntimeFile(filePath);

    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('recorder.ts - 记录器功能', () => {
  it('toTrajectoryToolDefinitions 应转换工具定义', () => {
    const tools = [
      { name: 'read', description: 'Read a file', parameters: { type: 'object' } },
      { name: 'write', description: 'Write a file', parameters: { type: 'object' } },
      { description: 'no name' },
    ];

    const result = toTrajectoryToolDefinitions(tools);

    expect(result.length).toBe(2);
    expect(result[0]?.name).toBe('read');
    expect(result[1]?.name).toBe('write');
    expect(result.every(t => typeof t.name === 'string')).toBe(true);
  });

  it('toTrajectoryToolDefinitions 应按名称排序', () => {
    const tools = [
      { name: 'zebra' },
      { name: 'apple' },
      { name: 'mango' },
    ];

    const result = toTrajectoryToolDefinitions(tools);

    expect(result.map(t => t.name)).toEqual(['apple', 'mango', 'zebra']);
  });
});

describe('types.ts - TrajectoryRecorder 类', () => {
  it('应创建 TrajectoryRecorder 实例', () => {
    const tmpDir = makeTempDir();
    const filePath = path.join(tmpDir, 'test.jsonl');
    const recorder = new TrajectoryRecorder({
      sessionId: 'test-session',
      filePath,
      enabled: true,
    });

    expect(recorder).toBeInstanceOf(TrajectoryRecorder);
  });

  it('应记录事件', async () => {
    const tmpDir = makeTempDir();
    const filePath = path.join(tmpDir, 'test.jsonl');
    const recorder = new TrajectoryRecorder({
      sessionId: 'test-session',
      filePath,
      enabled: true,
    });

    recorder.recordEvent('test.event', { key: 'value' });
    await recorder.flush();

    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('test.event');
    expect(content).toContain('value');
  });

  it('禁用的记录器不应记录事件', async () => {
    const tmpDir = makeTempDir();
    const filePath = path.join(tmpDir, 'test.jsonl');
    const recorder = new TrajectoryRecorder({
      sessionId: 'test-session',
      filePath,
      enabled: false,
    });

    recorder.recordEvent('test.event', { key: 'value' });
    await recorder.flush();

    const exists = fs.existsSync(filePath);
    if (exists) {
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toBe('');
    }
  });

  it('describeFlushState 应返回刷新状态', () => {
    const tmpDir = makeTempDir();
    const filePath = path.join(tmpDir, 'test.jsonl');
    const recorder = new TrajectoryRecorder({
      sessionId: 'test-session',
      filePath,
      enabled: true,
    });

    const state = recorder.describeFlushState();
    expect(state).toHaveProperty('pendingWrites');
    expect(state).toHaveProperty('queuedBytes');
    expect(state).toHaveProperty('activeOperation');
  });

  it('应支持声明式事件过滤（includeTypes）', async () => {
    const tmpDir = makeTempDir();
    const filePath = path.join(tmpDir, 'test.jsonl');
    const recorder = new TrajectoryRecorder({
      sessionId: 'test-session',
      filePath,
      enabled: true,
      filter: {
        includeTypes: ['included.type'],
      },
    });

    recorder.recordEvent('included.type', { data: 'yes' });
    recorder.recordEvent('excluded.type', { data: 'no' });
    await recorder.flush();

    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('included.type');
    expect(content).not.toContain('excluded.type');
  });

  it('应支持声明式事件过滤（excludeTypes）', async () => {
    const tmpDir = makeTempDir();
    const filePath = path.join(tmpDir, 'test.jsonl');
    const recorder = new TrajectoryRecorder({
      sessionId: 'test-session',
      filePath,
      enabled: true,
      filter: {
        excludeTypes: ['excluded.type'],
      },
    });

    recorder.recordEvent('included.type', { data: 'yes' });
    recorder.recordEvent('excluded.type', { data: 'no' });
    await recorder.flush();

    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('included.type');
    expect(content).not.toContain('excluded.type');
  });

  it('应支持函数式事件过滤器', async () => {
    const tmpDir = makeTempDir();
    const filePath = path.join(tmpDir, 'test.jsonl');
    const recorder = new TrajectoryRecorder({
      sessionId: 'test-session',
      filePath,
      enabled: true,
      eventFilter: (type) => type.startsWith('keep.'),
    });

    recorder.recordEvent('keep.event', { data: 'yes' });
    recorder.recordEvent('drop.event', { data: 'no' });
    await recorder.flush();

    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('keep.event');
    expect(content).not.toContain('drop.event');
  });
});

describe('command-export.ts - 命令导出', () => {
  it('parseArgs 应解析命令行参数', () => {
    const exporter = new TrajectoryCommandExporter();

    const options = exporter.parseArgs([
      '--input', 'input.jsonl',
      '--output', 'output.json',
      '--format', 'json',
      '--pretty',
      '--filter-type', 'tool.call,tool.result',
    ]);

    expect(options.input).toBe('input.jsonl');
    expect(options.output).toBe('output.json');
    expect(options.format).toBe('json');
    expect(options.pretty).toBe(true);
    expect(options.filterType).toEqual(['tool.call', 'tool.result']);
  });

  it('parseArgs 应支持短参数', () => {
    const exporter = new TrajectoryCommandExporter();

    const options = exporter.parseArgs([
      '-i', 'input.jsonl',
      '-o', 'output.json',
      '-f', 'json',
    ]);

    expect(options.input).toBe('input.jsonl');
    expect(options.output).toBe('output.json');
    expect(options.format).toBe('json');
  });

  it('应支持 --to-shell 选项', async () => {
    const tmpDir = makeTempDir();
    const inputPath = path.join(tmpDir, 'input.jsonl');
    const outputPath = path.join(tmpDir, 'output.sh');

    const events: TrajectoryEvent[] = [
      {
        traceSchema: 'cdf-know-trajectory',
        schemaVersion: 1,
        traceId: 'test-session',
        source: 'runtime',
        type: 'tool.call',
        ts: '2026-04-01T00:00:00.000Z',
        seq: 1,
        sessionId: 'test-session',
        data: {
          toolName: 'bash',
          arguments: { command: 'echo "hello world"' },
        },
      },
    ];
    writeTrajectoryFile(inputPath, events);

    const exporter = new TrajectoryCommandExporter();
    const result = await exporter.execute({
      input: inputPath,
      output: outputPath,
      toShell: true,
      shellType: 'bash',
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(outputPath)).toBe(true);
    const content = fs.readFileSync(outputPath, 'utf8');
    expect(content).toContain('#!/usr/bin/env bash');
    expect(content).toContain('echo "hello world"');
  });
});
