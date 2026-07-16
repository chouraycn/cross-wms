import { logger } from '../../logger.js';

export interface DiskSpaceInfo {
  free: number;
  total: number;
  used: number;
  percent: number;
}

export async function getDiskSpace(path: string = '/'): Promise<DiskSpaceInfo | null> {
  try {
    const diskusage = await import('diskusage');
    const info = await diskusage.check(path);
    
    const used = info.total - info.available;
    const percent = (used / info.total) * 100;
    
    logger.debug(`[infra:DiskSpace] Path: ${path}, Free: ${formatBytes(info.free)}`);
    
    return {
      free: info.free,
      total: info.total,
      used,
      percent: Math.round(percent * 100) / 100,
    };
  } catch {
    try {
      const fs = await import('fs');
      const stat = fs.statfsSync(path);
      const free = stat.bavail * stat.bsize;
      const total = stat.blocks * stat.bsize;
      const used = total - free;
      const percent = (used / total) * 100;
      
      return {
        free,
        total,
        used,
        percent: Math.round(percent * 100) / 100,
      };
    } catch (err) {
      logger.error(`[infra:DiskSpace] Failed to get disk space: ${err}`);
      return null;
    }
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

export function isLowDiskSpace(
  info: DiskSpaceInfo,
  thresholdPercent: number = 10
): boolean {
  return info.percent >= (100 - thresholdPercent);
}

export function getDiskSpaceWarning(info: DiskSpaceInfo): string | null {
  if (isLowDiskSpace(info, 5)) {
    return `Critical: Only ${formatBytes(info.free)} free (${info.percent.toFixed(1)}% used)`;
  }
  if (isLowDiskSpace(info, 10)) {
    return `Warning: Only ${formatBytes(info.free)} free (${info.percent.toFixed(1)}% used)`;
  }
  return null;
}