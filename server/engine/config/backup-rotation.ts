// 移植自 openclaw/src/config/backup-rotation.ts
// 轮转配置备份文件，保留最近的恢复点。
import path from 'node:path';

const CONFIG_BACKUP_COUNT = 5;

interface BackupRotationFs {
  unlink: (path: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  chmod?: (path: string, mode: number) => Promise<void>;
  readdir?: (path: string) => Promise<string[]>;
}

interface BackupMaintenanceFs extends BackupRotationFs {
  copyFile: (from: string, to: string) => Promise<void>;
}

/**
 * 在新的主备份复制进来之前，推进配置 `.bak` 环形队列。
 *
 * 缺失的槽位会被忽略，因此中断的写入或首次运行配置不会阻塞下一次配置写入。
 */
export async function rotateConfigBackups(
  configPath: string,
  ioFs: BackupRotationFs,
): Promise<void> {
  if (CONFIG_BACKUP_COUNT <= 1) {
    return;
  }
  const backupBase = `${configPath}.bak`;
  const maxIndex = CONFIG_BACKUP_COUNT - 1;
  await ioFs.unlink(`${backupBase}.${maxIndex}`).catch(() => {
    // best-effort
  });
  for (let index = maxIndex - 1; index >= 1; index -= 1) {
    await ioFs.rename(`${backupBase}.${index}`, `${backupBase}.${index + 1}`).catch(() => {
      // best-effort
    });
  }
  await ioFs.rename(backupBase, `${backupBase}.1`).catch(() => {
    // best-effort
  });
}

/**
 * 当 chmod 可用时，为每个备份槽位设置仅所有者权限。
 *
 * 备份会复制到混合文件系统上，因此复制模式保留不是可移植的安全保证。
 */
export async function hardenBackupPermissions(
  configPath: string,
  ioFs: BackupRotationFs,
): Promise<void> {
  if (!ioFs.chmod) {
    return;
  }
  const backupBase = `${configPath}.bak`;
  await ioFs.chmod(backupBase, 0o600).catch(() => {
    // best-effort
  });
  for (let i = 1; i < CONFIG_BACKUP_COUNT; i++) {
    await ioFs.chmod(`${backupBase}.${i}`, 0o600).catch(() => {
      // best-effort
    });
  }
}

/** 清理受管编号环形队列之外的陈旧 `.bak.*` 文件。 */
export async function cleanOrphanBackups(
  configPath: string,
  ioFs: BackupRotationFs,
): Promise<void> {
  if (!ioFs.readdir) {
    return;
  }
  const dir = path.dirname(configPath);
  const base = path.basename(configPath);
  const bakPrefix = `${base}.bak.`;

  const validSuffixes = new Set<string>();
  for (let i = 1; i < CONFIG_BACKUP_COUNT; i++) {
    validSuffixes.add(String(i));
  }

  let entries: string[];
  try {
    entries = await ioFs.readdir(dir);
  } catch {
    return; // best-effort
  }

  for (const entry of entries) {
    if (!entry.startsWith(bakPrefix)) {
      continue;
    }
    const suffix = entry.slice(bakPrefix.length);
    if (validSuffixes.has(suffix)) {
      continue;
    }
    await ioFs.unlink(path.join(dir, entry)).catch(() => {
      // best-effort
    });
  }
}

interface PreUpdateSnapshotFs {
  writeFile: (
    path: string,
    content: string,
    options: { encoding: 'utf-8'; mode: number; flag: 'w' },
  ) => Promise<void>;
  readFile: (path: string, encoding: 'utf-8') => Promise<string>;
  existsSync: (path: string) => boolean;
}

const preUpdateConfigSnapshotsWritten = new Set<string>();

/**
 * 捕获一次更新尝试中磁盘上的第一个配置状态。
 *
 * 快照位于轮转的 `.bak` 环形队列之外，因此一个进程中的重复写入会为原始文件保留一个操作员可见的回滚点。
 */
export async function createPreUpdateConfigSnapshot(params: {
  configPath: string;
  fs: PreUpdateSnapshotFs;
}): Promise<void> {
  if (!params.fs.existsSync(params.configPath)) {
    return;
  }
  const snapshotKey = path.resolve(params.configPath);
  if (preUpdateConfigSnapshotsWritten.has(snapshotKey)) {
    return;
  }
  // 在 I/O 之前标记，这样失败的 best-effort 写入不会在后续每次写入时循环。
  preUpdateConfigSnapshotsWritten.add(snapshotKey);
  const snapshotPath = `${params.configPath}.pre-update`;
  try {
    const content = await params.fs.readFile(params.configPath, 'utf-8');
    await params.fs.writeFile(snapshotPath, content, {
      encoding: 'utf-8',
      mode: 0o600,
      flag: 'w',
    });
  } catch {
    // best-effort，不阻塞更新
  }
}

/** 依次执行轮转、主副本复制、权限加固、孤儿清理。 */
export async function maintainConfigBackups(
  configPath: string,
  ioFs: BackupMaintenanceFs,
): Promise<void> {
  await rotateConfigBackups(configPath, ioFs);
  await ioFs.copyFile(configPath, `${configPath}.bak`).catch(() => {
    // best-effort
  });
  await hardenBackupPermissions(configPath, ioFs);
  await cleanOrphanBackups(configPath, ioFs);
}
