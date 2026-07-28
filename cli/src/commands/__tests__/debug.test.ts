import { describe, it, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { backupCommand } from '../backup.js';

describe('debug', () => {
  let tempDir: string;
  let originalStateDir: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-test-'));
    await fs.writeFile(path.join(tempDir, 'config.json'), '{"foo":"bar"}', 'utf-8');
    originalStateDir = process.env.CROSSWMS_STATE_DIR;
    process.env.CROSSWMS_STATE_DIR = tempDir;
  });

  afterEach(async () => {
    if (originalStateDir === undefined) delete process.env.CROSSWMS_STATE_DIR;
    else process.env.CROSSWMS_STATE_DIR = originalStateDir;
    try { await fs.rm(tempDir, { recursive: true, force: true }); } catch {}
  });

  it('test1 (first create)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const outDir = path.join(tempDir, 'out');
    process.stderr.write(`test1: starting\n`);
    await backupCommand.parseAsync(['node', 'test', 'create', '-o', outDir]);
    const files = await fs.readdir(outDir).catch((e) => {
      process.stderr.write(`test1 READDIR ERR: ${e.message}\n`);
      return [];
    });
    process.stderr.write(`test1 FILES: ${JSON.stringify(files)}\n`);
  });

  it('test2 (second create with --name)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const outDir = path.join(tempDir, 'out');
    process.stderr.write(`test2: starting\n`);
    try {
      await backupCommand.parseAsync(['node', 'test', 'create', '-o', outDir, '-n', 'my-backup']);
    } catch (e) {
      process.stderr.write(`test2 ERR: ${(e as Error).message}\n`);
    }
    const files = await fs.readdir(outDir).catch((e) => {
      process.stderr.write(`test2 READDIR ERR: ${e.message}\n`);
      return [];
    });
    process.stderr.write(`test2 FILES: ${JSON.stringify(files)}\n`);
  });
});
