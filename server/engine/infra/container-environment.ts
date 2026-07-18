// 检测容器运行时及相关的环境提示，用于诊断
import fs from "node:fs";

/**
 * 检测当前进程是否运行在容器内
 *（Docker、Podman 或 Kubernetes）。
 *
 * 使用两个可靠的启发式判断：
 * - 存在常见的容器哨兵文件。
 * - /proc/1/cgroup 中存在容器相关条目。
 *
 * 结果在首次调用后缓存，因此文件系统访问在每个进程生命周期内最多发生一次。
 */
let containerEnvironmentCache: boolean | undefined;

export function isContainerEnvironment(): boolean {
  if (containerEnvironmentCache !== undefined) {
    return containerEnvironmentCache;
  }
  containerEnvironmentCache = detectContainerEnvironment();
  return containerEnvironmentCache;
}

function detectContainerEnvironment(): boolean {
  if (process.env.FLY_MACHINE_ID?.trim() && process.env.FLY_APP_NAME?.trim()) {
    return true;
  }

  for (const sentinelPath of ["/.dockerenv", "/run/.containerenv", "/var/run/.containerenv"]) {
    try {
      fs.accessSync(sentinelPath, fs.constants.F_OK);
      return true;
    } catch {
      // 不存在；尝试下一个信号
    }
  }

  try {
    const cgroup = fs.readFileSync("/proc/1/cgroup", "utf8");
    if (
      /\/docker\/|cri-containerd-[0-9a-f]|containerd\/[0-9a-f]{64}|\/kubepods[/.]|\blxc\b/.test(
        cgroup,
      )
    ) {
      return true;
    }
  } catch {
    // 非 Linux 平台可能不存在 /proc
  }

  return false;
}

/** @internal 测试辅助 */
export function resetContainerEnvironmentCacheForTest(): void {
  containerEnvironmentCache = undefined;
}
