/**
 * 轨迹系统测试 — 验证实际 API 表面（移植自 openclaw 的函数式 API）。
 *
 * 覆盖：路径解析、文件名清理、运行时录制、元数据构建、清理。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  safeTrajectorySessionFileName,
  resolveTrajectoryFilePath,
  resolveTrajectoryPointerFilePath,
  resolveTrajectoryPointerOpenFlags,
  TRAJECTORY_RUNTIME_CAPTURE_MAX_BYTES,
  TRAJECTORY_RUNTIME_FILE_MAX_BYTES,
  TRAJECTORY_RUNTIME_EVENT_MAX_BYTES,
} from '../paths.js';
import {
  isRegularNonSymlinkFile,
  resolveTrajectoryRuntimeFile,
} from '../runtime-file.js';
import {
  toTrajectoryToolDefinitions,
  createTrajectoryRuntimeRecorder,
} from '../runtime.js';
import {
  buildTrajectoryRunMetadata,
} from '../metadata.js';
import {
  resolveDefaultTrajectoryExportDir,
} from '../export.js';
import {
  resolveTrajectoryCommandOutputDir,
  formatTrajectoryCommandExportSummary,
} from '../command-export.js';
import {
  removeSessionTrajectoryArtifacts,
} from '../cleanup.js';
import type { TrajectoryEvent } from '../types.js';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-wms-traj-'));
let tempDirId = 0;

function makeTempDir(): string {
  const dir = path.join(tempRoot, `case-${tempDirId++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createTestEvent(seq: number, sessionId: string, type = 'user.message'): TrajectoryEvent {
  return {
    traceSchema: 'openclaw-trajectory',
    schemaVersion: 1,
    traceId: sessionId,
    source: 'runtime',
    type,
    ts: new Date(Date.now() + seq * 1000).toISOString(),
    seq,
    sessionId,
    data: { content: `event-${seq}` },
  };
}

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('paths.ts - 路径与文件名', () => {
  it('safeTrajectorySessionFileName 应清理特殊字符并限制长度', () => {
    expect(safeTrajectorySessionFileName('normal-session_123')).toBe('normal-session_123');
    expect(safeTrajectorySessionFileName('../evil/path')).toBe('___evil_path');
    expect(safeTrajectorySessionFileName('a'.repeat(200))).toHaveLength(120);
    expect(safeTrajectorySessionFileName('!!!')).toBe('session');
  });

  it('resolveTrajectoryFilePath 应支持 OPENCLAW_TRAJECTORY_DIR 覆盖', () => {
    const customDir = makeTempDir();
    const filePath = resolveTrajectoryFilePath({
      env: { OPENCLAW_TRAJECTORY_DIR: customDir },
      sessionId: 'test-session',
    });
    expect(filePath.startsWith(customDir)).toBe(true);
    expect(filePath.endsWith('.jsonl')).toBe(true);
    expect(path.basename(filePath)).toBe('test-session.jsonl');
  });

  it('resolveTrajectoryFilePath 无覆盖时使用 cwd 并附加 .trajectory.jsonl', () => {
    const filePath = resolveTrajectoryFilePath({
      env: {},
      sessionId: 'my-session',
    });
    expect(filePath.endsWith('my-session.trajectory.jsonl')).toBe(true);
  });

  it('resolveTrajectoryFilePath 应基于 sessionFile 派生 sidecar 路径', () => {
    const filePath = resolveTrajectoryFilePath({
      env: {},
      sessionFile: '/tmp/foo/session.jsonl',
      sessionId: 'ignored',
    });
    expect(filePath).toBe('/tmp/foo/session.trajectory.jsonl');
  });

  it('resolveTrajectoryPointerFilePath 应派生 pointer 路径', () => {
    expect(resolveTrajectoryPointerFilePath('/tmp/x/session.jsonl'))
      .toBe('/tmp/x/session.trajectory-path.json');
    expect(resolveTrajectoryPointerFilePath('/tmp/x/plain'))
      .toBe('/tmp/x/plain.trajectory-path.json');
  });

  it('resolveTrajectoryPointerOpenFlags 应返回写创建标志', () => {
    const flags = resolveTrajectoryPointerOpenFlags();
    // 至少应包含 O_CREAT | O_TRUNC | O_WRONLY
    expect(flags & fs.constants.O_CREAT).toBeTruthy();
    expect(flags & fs.constants.O_TRUNC).toBeTruthy();
    expect(flags & fs.constants.O_WRONLY).toBeTruthy();
  });

  it('应导出常量', () => {
    expect(TRAJECTORY_RUNTIME_CAPTURE_MAX_BYTES).toBeGreaterThan(0);
    expect(TRAJECTORY_RUNTIME_FILE_MAX_BYTES).toBeGreaterThan(0);
    expect(TRAJECTORY_RUNTIME_EVENT_MAX_BYTES).toBeGreaterThan(0);
  });
});

describe('runtime-file.ts - 文件检测', () => {
  it('isRegularNonSymlinkFile 对普通文件返回 true', async () => {
    const tmpDir = makeTempDir();
    const filePath = path.join(tmpDir, 'regular.txt');
    fs.writeFileSync(filePath, 'hello', 'utf8');
    expect(await isRegularNonSymlinkFile(filePath)).toBe(true);
  });

  it('isRegularNonSymlinkFile 对不存在文件返回 false', async () => {
    expect(await isRegularNonSymlinkFile('/nonexistent/path/file.txt')).toBe(false);
  });

  it('isRegularNonSymlinkFile 对符号链接返回 false', async () => {
    const tmpDir = makeTempDir();
    const real = path.join(tmpDir, 'real.txt');
    const link = path.join(tmpDir, 'link.txt');
    fs.writeFileSync(real, 'data', 'utf8');
    fs.symlinkSync(real, link);
    expect(await isRegularNonSymlinkFile(link)).toBe(false);
    expect(await isRegularNonSymlinkFile(real)).toBe(true);
  });

  it('resolveTrajectoryRuntimeFile 对不存在 pointer 返回 undefined', async () => {
    const result = await resolveTrajectoryRuntimeFile({
      sessionFile: '/nonexistent/session.jsonl',
      sessionId: 'no-session',
    });
    expect(result).toBeUndefined();
  });
});

describe('runtime.ts - 工具定义与录制器', () => {
  it('toTrajectoryToolDefinitions 应转换并排序工具', () => {
    const tools = [
      { name: 'zebra', description: 'z tool' },
      { name: 'alpha', description: 'a tool', parameters: { type: 'object' } },
      { name: '', description: 'no name, should be skipped' },
      { description: 'no name either' },
    ];
    const defs = toTrajectoryToolDefinitions(tools);
    expect(defs).toHaveLength(2);
    expect(defs[0]!.name).toBe('alpha');
    expect(defs[1]!.name).toBe('zebra');
    expect(defs[1]!.description).toBe('z tool');
  });

  it('createTrajectoryRuntimeRecorder 在禁用时应返回 null', () => {
    const recorder = createTrajectoryRuntimeRecorder({
      sessionId: 'disabled',
      env: { OPENCLAW_TRAJECTORY: '0' } as NodeJS.ProcessEnv,
    });
    expect(recorder).toBeNull();
  });

  it('createTrajectoryRuntimeRecorder 应写入事件到文件', async () => {
    const tmpDir = makeTempDir();
    const sessionId = 'rec-test';
    const recorder = createTrajectoryRuntimeRecorder({
      sessionId,
      env: { OPENCLAW_TRAJECTORY_DIR: tmpDir } as NodeJS.ProcessEnv,
    });
    expect(recorder).not.toBeNull();
    expect(recorder!.enabled).toBe(true);
    expect(recorder!.filePath).toContain(sessionId);

    recorder!.recordEvent('user.message', { content: 'hello' });
    await recorder!.flush();

    const trajectoryFile = recorder!.filePath;
    expect(fs.existsSync(trajectoryFile)).toBe(true);
    const content = fs.readFileSync(trajectoryFile, 'utf8').trim();
    const parsed = JSON.parse(content) as TrajectoryEvent;
    expect(parsed.traceSchema).toBe('openclaw-trajectory');
    expect(parsed.sessionId).toBe(sessionId);
    expect(parsed.seq).toBe(1);
    expect(parsed.type).toBe('user.message');
  });
});

describe('metadata.ts - 元数据构建', () => {
  it('buildTrajectoryRunMetadata 应返回包含基本字段的记录', () => {
    const tmpDir = makeTempDir();
    const meta = buildTrajectoryRunMetadata({
      workspaceDir: tmpDir,
      env: { HOME: tmpDir } as NodeJS.ProcessEnv,
    });
    expect(meta).toBeDefined();
    expect(meta.capturedAt).toBeDefined();
    expect(meta.harness).toBeDefined();
    expect(meta.harness.type).toBe('openclaw');
  });
});

describe('export.ts - 导出目录解析', () => {
  it('resolveDefaultTrajectoryExportDir 应包含 workspace 与时间戳', () => {
    const tmpDir = makeTempDir();
    const now = new Date('2026-04-01T00:00:00.000Z');
    const dir = resolveDefaultTrajectoryExportDir({
      workspaceDir: tmpDir,
      sessionId: 'export-test',
      now,
    });
    expect(dir.startsWith(tmpDir)).toBe(true);
    expect(dir).toContain('trajectory-exports');
    expect(dir).toContain('2026-04-01T00-00-00');
  });
});

describe('command-export.ts - 命令导出辅助', () => {
  it('resolveTrajectoryCommandOutputDir 应解析输出目录', async () => {
    const tmpDir = makeTempDir();
    const dir = await resolveTrajectoryCommandOutputDir({
      workspaceDir: tmpDir,
      sessionId: 'cmd-test',
    });
    expect(dir.startsWith(tmpDir)).toBe(true);
  });

  it('formatTrajectoryCommandExportSummary 应格式化摘要', () => {
    const summary = formatTrajectoryCommandExportSummary({
      outputDir: '/tmp/out',
      displayPath: '/tmp/out/events.jsonl',
      sessionId: 'cmd-test',
      eventCount: 42,
      runtimeEventCount: 30,
      transcriptEventCount: 12,
      files: ['events.jsonl', 'manifest.json'],
    });
    expect(summary).toContain('42');
    expect(summary).toContain('/tmp/out');
    expect(summary).toContain('events.jsonl');
  });
});

describe('cleanup.ts - 清理', () => {
  it('removeSessionTrajectoryArtifacts 应清理 runtime 与 pointer 文件', async () => {
    const tmpDir = makeTempDir();
    const sessionId = 'cleanup-test';

    // 构造 session 文件（cleanup 基于 sessionFile 派生 runtime 路径）
    const sessionFile = path.join(tmpDir, `${sessionId}.jsonl`);
    fs.writeFileSync(sessionFile, '', 'utf8');

    // 构造 runtime 文件（sidecar 路径：session.trajectory.jsonl）
    const trajectoryFile = resolveTrajectoryFilePath({
      env: {},
      sessionFile,
      sessionId,
    });
    const event = createTestEvent(1, sessionId);
    fs.writeFileSync(trajectoryFile, JSON.stringify(event) + '\n', 'utf8');

    // 构造 pointer 文件（必须使用 openclaw-trajectory-pointer schema）
    const pointerFile = resolveTrajectoryPointerFilePath(sessionFile);
    fs.writeFileSync(
      pointerFile,
      JSON.stringify({
        traceSchema: 'openclaw-trajectory-pointer',
        schemaVersion: 1,
        sessionId,
        runtimeFile: trajectoryFile,
      }),
      'utf8',
    );

    const removed = await removeSessionTrajectoryArtifacts({
      sessionId,
      sessionFile,
      storePath: sessionFile,
    });
    expect(removed.length).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(trajectoryFile)).toBe(false);
    expect(fs.existsSync(pointerFile)).toBe(false);
  });

  it('removeSessionTrajectoryArtifacts 对不存在的会话应返回空数组', async () => {
    const removed = await removeSessionTrajectoryArtifacts({
      sessionId: 'nonexistent',
      sessionFile: '/nonexistent/session.jsonl',
      storePath: '/nonexistent/session.jsonl',
    });
    expect(removed).toEqual([]);
  });
});
