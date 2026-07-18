export type VersionGuardOptions = {
  minVersion?: string;
  maxVersion?: string;
  allowedVersions?: string[];
  version?: string;
};

export type VersionGuardResult = {
  valid: boolean;
  reason?: string;
  currentVersion: string;
};

export function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map((p) => {
    const match = p.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  });
  const partsB = b.split(".").map((p) => {
    const match = p.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  });

  const maxLength = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLength; i++) {
    const partA = partsA[i] ?? 0;
    const partB = partsB[i] ?? 0;

    if (partA > partB) return 1;
    if (partA < partB) return -1;
  }

  return 0;
}

export function checkVersionGuard(options: VersionGuardOptions): VersionGuardResult {
  const { minVersion, maxVersion, allowedVersions, version = process.version.slice(1) } = options;

  if (minVersion && compareVersions(version, minVersion) < 0) {
    return {
      valid: false,
      reason: `Version ${version} is below minimum required version ${minVersion}`,
      currentVersion: version,
    };
  }

  if (maxVersion && compareVersions(version, maxVersion) > 0) {
    return {
      valid: false,
      reason: `Version ${version} exceeds maximum allowed version ${maxVersion}`,
      currentVersion: version,
    };
  }

  if (allowedVersions && allowedVersions.length > 0) {
    const isValid = allowedVersions.some((v) => compareVersions(version, v) === 0);
    if (!isValid) {
      return {
        valid: false,
        reason: `Version ${version} is not in the allowed versions list: ${allowedVersions.join(", ")}`,
        currentVersion: version,
      };
    }
  }

  return {
    valid: true,
    currentVersion: version,
  };
}

export function assertVersionGuard(options: VersionGuardOptions): void {
  const result = checkVersionGuard(options);
  if (!result.valid) {
    throw new Error(result.reason || "Version check failed");
  }
}

export function isVersionCompatible(version: string, minVersion?: string, maxVersion?: string): boolean {
  return checkVersionGuard({ version, minVersion, maxVersion }).valid;
}

export function getVersionStatus(options: VersionGuardOptions): "compatible" | "outdated" | "too-new" {
  const { minVersion, maxVersion, version = process.version.slice(1) } = options;

  if (minVersion && compareVersions(version, minVersion) < 0) {
    return "outdated";
  }

  if (maxVersion && compareVersions(version, maxVersion) > 0) {
    return "too-new";
  }

  return "compatible";
}