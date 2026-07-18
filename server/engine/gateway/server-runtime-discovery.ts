import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../logger.js';

type ResolveBonjourCliPathOptions = {
  env?: NodeJS.ProcessEnv;
  argv?: string[];
  execPath?: string;
  cwd?: string;
  statSync?: (path: string) => fs.Stats;
};

export function formatBonjourInstanceName(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return 'CrossWMS';
  }
  if (/crosswms/i.test(trimmed) || /cross-wms/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} (CrossWMS)`;
}

export function resolveBonjourCliPath(opts: ResolveBonjourCliPathOptions = {}): string | undefined {
  const env = opts.env ?? process.env;
  const envPath = env.CROSSWMS_CLI_PATH?.trim();
  if (envPath) {
    return envPath;
  }

  const statSync = opts.statSync ?? fs.statSync;
  const isFile = (candidate: string): boolean => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  };

  const execPath = opts.execPath ?? process.execPath;
  const execDir = path.dirname(execPath);
  const siblingCli = path.join(execDir, 'cdf-cli');
  if (isFile(siblingCli)) {
    return siblingCli;
  }

  const argv = opts.argv ?? process.argv;
  const argvPath = argv[1];
  if (argvPath && isFile(argvPath)) {
    return argvPath;
  }

  const cwd = opts.cwd ?? process.cwd();
  const distCli = path.join(cwd, 'dist', 'index.js');
  if (isFile(distCli)) {
    return distCli;
  }
  const binCli = path.join(cwd, 'bin', 'cdf-cli.mjs');
  if (isFile(binCli)) {
    return binCli;
  }

  return undefined;
}

export type GatewayDiscoveryInfo = {
  instanceName: string;
  version: string;
  port: number;
  host: string;
  cliPath?: string;
  startedAt: number;
  features: string[];
};

let discoveryInfo: GatewayDiscoveryInfo | null = null;

export function setGatewayDiscoveryInfo(info: GatewayDiscoveryInfo): void {
  discoveryInfo = info;
  logger.debug('[Gateway] Discovery info updated');
}

export function getGatewayDiscoveryInfo(): GatewayDiscoveryInfo | null {
  return discoveryInfo;
}

export function clearGatewayDiscoveryInfo(): void {
  discoveryInfo = null;
}

export function getDiscoveryHosts(bindHost: string): string[] {
  const hosts = new Set<string>();

  if (bindHost === '0.0.0.0' || bindHost === '::') {
    hosts.add('127.0.0.1');
    hosts.add('localhost');
  } else {
    hosts.add(bindHost);
    if (bindHost === '127.0.0.1') {
      hosts.add('localhost');
    }
  }

  return Array.from(hosts);
}

export function formatGatewayUrl(host: string, port: number, tls = false): string {
  const protocol = tls ? 'https' : 'http';
  return `${protocol}://${host}:${port}`;
}

export function listGatewayUrls(params: {
  bindHost: string;
  port: number;
  tls?: boolean;
}): string[] {
  const hosts = getDiscoveryHosts(params.bindHost);
  return hosts.map((host) => formatGatewayUrl(host, params.port, params.tls));
}
