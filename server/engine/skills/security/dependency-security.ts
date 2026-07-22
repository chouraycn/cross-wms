import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../../logger.js";

export type DependencyVulnerability = {
  name: string;
  version: string;
  severity: "critical" | "high" | "medium" | "low";
  cve?: string;
  description: string;
  fixedVersion?: string;
};

export type DependencyScanResult = {
  skillDir: string;
  vulnerabilities: DependencyVulnerability[];
  scannedDependencies: number;
  totalDependencies: number;
};

type VulnerabilityEntry = {
  name: string;
  affectedVersions: string[];
  severity: DependencyVulnerability["severity"];
  cve?: string;
  description: string;
  fixedVersion?: string;
};

let vulnerabilityDatabase: VulnerabilityEntry[] | null = null;

const DANGEROUS_DEPENDENCIES = new Set([
  "shelljs",
  "eval",
  "vm2",
  "child_process",
  "request",
  "lodash",
  "underscore",
  "async",
  "moment",
  "bluebird",
  "uuid",
  "dotenv",
]);

export function loadVulnerabilityDatabase(): VulnerabilityEntry[] {
  if (vulnerabilityDatabase) {
    return vulnerabilityDatabase;
  }

  vulnerabilityDatabase = [
    {
      name: "lodash",
      affectedVersions: ["<4.17.21"],
      severity: "critical",
      cve: "CVE-2021-23337",
      description: "Prototype pollution vulnerability in lodash",
      fixedVersion: "4.17.21",
    },
    {
      name: "lodash",
      affectedVersions: ["<4.17.19"],
      severity: "high",
      cve: "CVE-2019-10744",
      description: "Command injection in lodash template function",
      fixedVersion: "4.17.19",
    },
    {
      name: "underscore",
      affectedVersions: ["<1.13.1"],
      severity: "critical",
      cve: "CVE-2021-23358",
      description: "Prototype pollution vulnerability in underscore",
      fixedVersion: "1.13.1",
    },
    {
      name: "async",
      affectedVersions: ["<2.6.4"],
      severity: "high",
      cve: "CVE-2022-40664",
      description: "Prototype pollution in async.js",
      fixedVersion: "2.6.4",
    },
    {
      name: "moment",
      affectedVersions: ["<2.29.4"],
      severity: "medium",
      cve: "CVE-2022-31129",
      description: "Regular expression denial of service in moment.js",
      fixedVersion: "2.29.4",
    },
    {
      name: "bluebird",
      affectedVersions: ["<3.7.2"],
      severity: "medium",
      description: "Prototype pollution in bluebird",
      fixedVersion: "3.7.2",
    },
    {
      name: "uuid",
      affectedVersions: ["<8.3.2"],
      severity: "low",
      cve: "CVE-2021-44228",
      description: "Insufficient entropy in random UUID generation",
      fixedVersion: "8.3.2",
    },
    {
      name: "dotenv",
      affectedVersions: ["<16.0.0"],
      severity: "medium",
      description: "Environment variable injection vulnerability",
      fixedVersion: "16.0.0",
    },
    {
      name: "request",
      affectedVersions: ["*"],
      severity: "critical",
      description: "Request package is deprecated and contains multiple vulnerabilities",
    },
    {
      name: "shelljs",
      affectedVersions: ["<0.8.5"],
      severity: "critical",
      cve: "CVE-2021-42744",
      description: "Command injection vulnerability in shelljs",
      fixedVersion: "0.8.5",
    },
    {
      name: "vm2",
      affectedVersions: ["<3.9.11"],
      severity: "critical",
      cve: "CVE-2022-31196",
      description: "Sandbox escape vulnerability in vm2",
      fixedVersion: "3.9.11",
    },
    {
      name: "axios",
      affectedVersions: ["<0.21.2", ">=0.22.0 <0.27.2"],
      severity: "high",
      cve: "CVE-2022-28194",
      description: "SSRF vulnerability in axios",
      fixedVersion: "0.27.2",
    },
    {
      name: "express",
      affectedVersions: ["<4.18.2"],
      severity: "high",
      cve: "CVE-2022-24999",
      description: "Path traversal in express static middleware",
      fixedVersion: "4.18.2",
    },
    {
      name: "body-parser",
      affectedVersions: ["<1.20.1"],
      severity: "high",
      cve: "CVE-2022-24999",
      description: "Denial of service vulnerability in body-parser",
      fixedVersion: "1.20.1",
    },
    {
      name: "jsonwebtoken",
      affectedVersions: ["<9.0.0"],
      severity: "critical",
      cve: "CVE-2022-23533",
      description: "Algorithm confusion vulnerability in jsonwebtoken",
      fixedVersion: "9.0.0",
    },
  ];

  logger.debug("[DependencySecurity] Vulnerability database loaded");
  return vulnerabilityDatabase;
}

function parseVersion(version: string): number[] {
  return version
    .replace(/[^0-9.]/g, "")
    .split(".")
    .map((v) => parseInt(v, 10) || 0);
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = parseVersion(v1);
  const parts2 = parseVersion(v2);
  const maxLen = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLen; i++) {
    const p1 = parts1[i] ?? 0;
    const p2 = parts2[i] ?? 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  return 0;
}

function isVersionAffected(version: string, affectedVersions: string[]): boolean {
  for (const range of affectedVersions) {
    if (range === "*") return true;
    if (range.startsWith("<")) {
      const maxVersion = range.slice(1);
      if (compareVersions(version, maxVersion) < 0) return true;
    } else if (range.startsWith(">=")) {
      const minVersion = range.slice(2).split(" <")[0];
      const maxVersion = range.split(" <")[1];
      if (compareVersions(version, minVersion) >= 0) {
        if (maxVersion && compareVersions(version, maxVersion) < 0) {
          return true;
        } else if (!maxVersion) {
          return true;
        }
      }
    }
  }
  return false;
}

export function matchVulnerabilities(
  dependencies: Record<string, string>,
): DependencyVulnerability[] {
  const db = loadVulnerabilityDatabase();
  const vulnerabilities: DependencyVulnerability[] = [];

  for (const [name, version] of Object.entries(dependencies)) {
    for (const entry of db) {
      if (entry.name === name && isVersionAffected(version, entry.affectedVersions)) {
        vulnerabilities.push({
          name,
          version,
          severity: entry.severity,
          cve: entry.cve,
          description: entry.description,
          fixedVersion: entry.fixedVersion,
        });
      }
    }
  }

  return vulnerabilities;
}

export function scanPackageJson(packageJson: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): { vulnerabilities: DependencyVulnerability[]; dangerous: string[] } {
  const allDependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };

  const vulnerabilities = matchVulnerabilities(allDependencies);
  const dangerous = Object.keys(allDependencies).filter((name) =>
    DANGEROUS_DEPENDENCIES.has(name),
  );

  if (dangerous.length > 0) {
    logger.warn(
      `[DependencySecurity] Found dangerous dependencies: ${dangerous.join(", ")}`,
    );
  }

  return { vulnerabilities, dangerous };
}

export async function scanSkillDependencies(skillDir: string): Promise<DependencyScanResult> {
  const packageJsonPath = path.join(skillDir, "package.json");
  const vulnerabilities: DependencyVulnerability[] = [];
  let totalDependencies = 0;

  logger.debug(`[DependencySecurity] Scanning dependencies in: ${skillDir}`);

  try {
    const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent);

    const allDependencies = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {}),
      ...(packageJson.peerDependencies || {}),
    };

    totalDependencies = Object.keys(allDependencies).length;

    const matched = matchVulnerabilities(allDependencies);
    vulnerabilities.push(...matched);

    logger.info(
      `[DependencySecurity] Found ${vulnerabilities.length} vulnerabilities in ${skillDir}`,
    );
  } catch (err) {
    logger.debug(`[DependencySecurity] No package.json found in: ${skillDir}`);
  }

  return {
    skillDir,
    vulnerabilities,
    scannedDependencies: vulnerabilities.length,
    totalDependencies,
  };
}

export async function checkDependencySecurity(skillDir: string): Promise<DependencyScanResult> {
  const result = await scanSkillDependencies(skillDir);

  if (result.vulnerabilities.length > 0) {
    const criticalCount = result.vulnerabilities.filter((v) => v.severity === "critical").length;
    const highCount = result.vulnerabilities.filter((v) => v.severity === "high").length;

    if (criticalCount > 0) {
      logger.error(
        `[DependencySecurity] Critical vulnerabilities found in ${skillDir}: ${criticalCount}`,
      );
    } else if (highCount > 0) {
      logger.warn(
        `[DependencySecurity] High severity vulnerabilities found in ${skillDir}: ${highCount}`,
      );
    }
  }

  return result;
}