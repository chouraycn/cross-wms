import { homedir } from "os";
import { resolve, normalize } from "path";

const SENSITIVE_PATH_PATTERNS = [
  /^\/etc\//,
  /^\/bin\//,
  /^\/sbin\//,
  /^\/usr\/bin\//,
  /^\/usr\/sbin\//,
  /^\/usr\/local\/bin\//,
  /^\/usr\/local\/sbin\//,
  /^\/var\//,
  /^\/tmp\//,
  /^\/dev\//,
  /^\/proc\//,
  /^\/sys\//,
  /^\/root\//,
  /^\/home\/[^/]+\/\.ssh\//,
  /^\/home\/[^/]+\/\.aws\//,
  /^\/home\/[^/]+\/\.gcp\//,
  /^\/home\/[^/]+\/\.kube\//,
  /^\/home\/[^/]+\/\.docker\//,
  /^\/home\/[^/]+\/\.git-credentials$/,
  /^\/home\/[^/]+\/\.npmrc$/,
  /^\/home\/[^/]+\/\.netrc$/,
];

const SENSITIVE_FILE_PATTERNS = [
  /\.ssh\/id_rsa$/,
  /\.ssh\/id_dsa$/,
  /\.ssh\/id_ecdsa$/,
  /\.ssh\/id_ed25519$/,
  /\.ssh\/authorized_keys$/,
  /\.ssh\/known_hosts$/,
  /\.aws\/credentials$/,
  /\.aws\/config$/,
  /\.kube\/config$/,
  /\.docker\/config\.json$/,
  /\.git-credentials$/,
  /\.npmrc$/,
  /\.netrc$/,
  /passwd$/,
  /shadow$/,
  /group$/,
];

export function isSensitivePath(path: string): boolean {
  const normalized = normalize(path);
  const home = normalize(homedir());
  const homeRelative = normalized.startsWith(home + "/") ? normalized.slice(home.length) : normalized;

  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    if (pattern.test(normalized) || pattern.test(homeRelative)) {
      return true;
    }
  }

  return false;
}

export function isSensitiveFile(path: string): boolean {
  const normalized = normalize(path);
  const home = normalize(homedir());
  const homeRelative = normalized.startsWith(home + "/") ? normalized.slice(home.length) : normalized;

  for (const pattern of SENSITIVE_FILE_PATTERNS) {
    if (pattern.test(normalized) || pattern.test(homeRelative)) {
      return true;
    }
  }

  return false;
}

export function getSensitivePathReason(path: string): string | null {
  const normalized = normalize(path);
  const home = normalize(homedir());
  const homeRelative = normalized.startsWith(home + "/") ? normalized.slice(home.length) : normalized;

  const reasons: Record<string, string> = {
    "/etc/": "System configuration directory",
    "/bin/": "System binaries",
    "/sbin/": "System binaries",
    "/usr/bin/": "User binaries",
    "/usr/sbin/": "User binaries",
    "/usr/local/bin/": "Local binaries",
    "/usr/local/sbin/": "Local binaries",
    "/var/": "Variable data",
    "/tmp/": "Temporary files",
    "/dev/": "Device files",
    "/proc/": "Process information",
    "/sys/": "System information",
    "/root/": "Root home directory",
    ".ssh/": "SSH configuration and keys",
    ".aws/": "AWS credentials",
    ".gcp/": "GCP credentials",
    ".kube/": "Kubernetes configuration",
    ".docker/": "Docker configuration",
    ".git-credentials": "Git credentials",
    ".npmrc": "NPM credentials",
    ".netrc": "Network credentials",
  };

  for (const [pattern, reason] of Object.entries(reasons)) {
    if (normalized.includes(pattern) || homeRelative.includes(pattern)) {
      return reason;
    }
  }

  return null;
}

export function validatePathForSensitivity(path: string): { valid: boolean; reason?: string } {
  if (isSensitivePath(path)) {
    return {
      valid: false,
      reason: getSensitivePathReason(path) || "Path is in a sensitive location",
    };
  }

  return { valid: true };
}

export function assertPathNotSensitive(path: string): void {
  const result = validatePathForSensitivity(path);
  if (!result.valid) {
    throw new Error(`Path is sensitive: ${result.reason || path}`);
  }
}

export function getSensitivePathPatterns(): RegExp[] {
  return [...SENSITIVE_PATH_PATTERNS];
}

export function getSensitiveFilePatterns(): RegExp[] {
  return [...SENSITIVE_FILE_PATTERNS];
}