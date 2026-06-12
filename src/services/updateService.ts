/**
 * 自动更新服务
 * 检查远程 release.json，对比版本，提示用户下载新版本
 */

// GitHub Releases release.json：优先使用 raw.githubusercontent.com（直连，无重定向）
// 回退到 /releases/latest/download/ 作为备用
const RELEASE_URL = 'https://raw.githubusercontent.com/chouraycn/cross-wms/main/release/release.json';
const RELEASE_URL_FALLBACK = 'https://github.com/chouraycn/cross-wms/releases/latest/download/release.json';

export interface ReleaseInfo {
  version: string;
  pubDate: string;
  notes: string;
  dmgUrl: string;
  minVersion: string; // 最低支持版本
}

export interface UpdateStatus {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseInfo?: ReleaseInfo;
  error?: string;
}

/**
 * 比较版本号（语义化版本）
 * 返回：1 = v1 > v2, 0 = v1 = v2, -1 = v1 < v2
 */
function compareVersions(v1: string, v2: string): number {
  const normalize = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const n1 = normalize(v1);
  const n2 = normalize(v2);

  for (let i = 0; i < Math.max(n1.length, n2.length); i++) {
    const a = n1[i] || 0;
    const b = n2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

/**
 * 带超时的 fetch 封装
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return resp;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/**
 * 检查更新
 * - 浏览器 / Electron 环境：直接使用 fetch（无 CORS 问题）
 * - pywebview 环境：调用 window.pywebview.api.get_release_info() 绕过 CORS
 */
export async function checkForUpdates(currentVersion: string): Promise<UpdateStatus> {
  try {
    let releaseInfo: ReleaseInfo;

    // pywebview 环境：通过 Python API 获取（绕过 CORS）
    if (typeof window !== 'undefined' && window.pywebview?.api?.get_release_info) {
      try {
        const resultStr = await Promise.race([
          window.pywebview.api.get_release_info(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('pywebview API 超时')), 8000))
        ]);
        const parsed = JSON.parse(resultStr);

        // 检查是否是 Python 侧返回的错误对象
        if (parsed.error) {
          throw new Error(parsed.error);
        }

        releaseInfo = parsed;
      } catch (pywebviewError) {
        // pywebview 调用失败，降级到 fetch（兼容旧版 pywebview 或未就绪情况）
        console.warn('[updateService] pywebview API 失败，降级到 fetch:', pywebviewError);
        try {
          let response = await fetchWithTimeout(RELEASE_URL, {
            method: 'GET',
            cache: 'no-cache',
          }, 8000);
          if (!response.ok) {
            // 尝试回退 URL
            response = await fetchWithTimeout(RELEASE_URL_FALLBACK, {
              method: 'GET',
              cache: 'no-cache',
            }, 8000);
          }
          if (!response.ok) {
            throw new Error(`无法获取更新信息: ${response.status}`);
          }
          releaseInfo = await response.json();
        } catch (fetchError) {
          // 两个方式都失败，返回详细错误
          const pyErr = pywebviewError instanceof Error ? pywebviewError.message : String(pywebviewError);
          const fErr = fetchError instanceof Error ? fetchError.message : String(fetchError);
          throw new Error(`更新检查失败: Python API (${pyErr}) + fetch (${fErr})`);
        }
      }
    } else {
      // 浏览器 / Electron 环境：直接 fetch（带超时 + 回退）
      try {
        let response = await fetchWithTimeout(RELEASE_URL, {
          method: 'GET',
          cache: 'no-cache',
        }, 8000);
        if (!response.ok) {
          throw new Error(`无法获取更新信息: ${response.status}`);
        }
        releaseInfo = await response.json();
      } catch (primaryError) {
        // 主 URL 失败，尝试回退 URL
        try {
          const response = await fetchWithTimeout(RELEASE_URL_FALLBACK, {
            method: 'GET',
            cache: 'no-cache',
          }, 8000);
          if (!response.ok) {
            throw new Error(`无法获取更新信息: ${response.status}`);
          }
          releaseInfo = await response.json();
        } catch (fetchError) {
          throw new Error(`无法检查更新: ${fetchError instanceof Error ? fetchError.message : fetchError}`);
        }
      }
    }

    const hasUpdate = compareVersions(releaseInfo.version, currentVersion) > 0;

    return {
      hasUpdate,
      currentVersion,
      latestVersion: releaseInfo.version,
      releaseInfo: hasUpdate ? releaseInfo : undefined,
    };
  } catch (error) {
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      error: error instanceof Error ? error.message : '检查更新失败',
    };
  }
}

/**
 * 打开下载链接
 */
export function openDownloadUrl(url: string): void {
  if (window.electronAPI?.openExternalLink) {
    window.electronAPI.openExternalLink(url).catch(() => {
      window.open(url, '_blank');
    });
  } else if (typeof window.pywebview !== 'undefined' && window.pywebview?.api) {
    // pywebview 环境：通过 Python API 打开
    window.pywebview.api.open_in_browser(url).catch(() => {
      window.open(url, '_blank');
    });
  } else {
    window.open(url, '_blank');
  }
}

/**
 * 格式化版本号（去掉 'v' 前缀）
 */
export function formatVersion(version: string): string {
  return version.replace(/^v/, '');
}
