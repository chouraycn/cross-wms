/**
 * System Tools — 系统信息查询
 */

/** 获取系统信息 */
export async function handleSystemInfo(): Promise<string> {
  const os = await import('os');
  return JSON.stringify({
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime(),
    hostname: os.hostname(),
  });
}
