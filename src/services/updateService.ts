/**
 * 自动更新服务
 * 检查远程 release.json，对比版本，提示用户下载新版本
 */

// GitHub Releases：release.json 随 DMG 一起上传到 Releases
const RELEASE_URL = 'https://github.com/chouraycn/cross-wms/releases/latest/download/release.json';

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
 * 检查更新
 */
export async function checkForUpdates(currentVersion: string): Promise<UpdateStatus> {
  try {
    const response = await fetch(RELEASE_URL, {
      method: 'GET',
      cache: 'no-cache',
    });

    if (!response.ok) {
      throw new Error(`无法获取更新信息: ${response.status}`);
    }

    const releaseInfo: ReleaseInfo = await response.json();

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
