import { logger } from '../../../logger.js';
export type SafeBinPolicy = {
  allowedBins: string[];
  blockedBins: string[];
  allowedPaths: string[];
  blockedPaths: string[];
  requireApprovalFor: string[];
};

const DEFAULT_ALLOWED_BINS = [
  'cat', 'echo', 'ls', 'pwd', 'cd', 'date', 'whoami', 'hostname',
  'head', 'tail', 'wc', 'sort', 'uniq', 'grep', 'find', 'file',
  'cp', 'mv', 'mkdir', 'rmdir', 'touch', 'chmod', 'chown',
  'git', 'node', 'npm', 'npx', 'yarn', 'pnpm',
  'python3', 'python', 'pip3', 'pip',
  'brew', 'port', 'apt', 'apt-get', 'yum', 'dnf',
  'code', 'curl', 'wget', 'tar', 'zip', 'unzip',
];

const DEFAULT_BLOCKED_BINS = [
  'rm', 'dd', 'mkfs', 'fdisk', 'parted',
  'sudo', 'su', 'chroot',
  'shutdown', 'reboot', 'halt', 'poweroff',
  'passwd', 'useradd', 'userdel', 'usermod',
  'iptables', 'ufw', 'firewall-cmd',
  'ssh-keygen', 'openssl',
  ':(){:|:&};:',
];

const DEFAULT_REQUIRE_APPROVAL = [
  'rm -rf', 'rm -r', 'rm -f',
  'sudo', 'su',
  'dd', 'mkfs', 'fdisk',
  'npm install -g', 'npm i -g',
  'pip install', 'pip3 install',
  'apt install', 'apt-get install', 'yum install', 'brew install',
];

export const DEFAULT_SAFE_BIN_POLICY: SafeBinPolicy = {
  allowedBins: DEFAULT_ALLOWED_BINS,
  blockedBins: DEFAULT_BLOCKED_BINS,
  allowedPaths: [],
  blockedPaths: [],
  requireApprovalFor: DEFAULT_REQUIRE_APPROVAL,
};

export function isBinAllowed(bin: string, policy: SafeBinPolicy = DEFAULT_SAFE_BIN_POLICY): boolean {
  const binName = bin.toLowerCase();
  
  if (policy.blockedBins.some(b => binName === b.toLowerCase())) {
    return false;
  }
  
  if (policy.allowedBins.length === 0) {
    return true;
  }
  
  return policy.allowedBins.some(b => binName === b.toLowerCase());
}

export function isBinBlocked(bin: string, policy: SafeBinPolicy = DEFAULT_SAFE_BIN_POLICY): boolean {
  return !isBinAllowed(bin, policy);
}

export function requiresApproval(command: string, args: string[], policy: SafeBinPolicy = DEFAULT_SAFE_BIN_POLICY): boolean {
  const fullCommand = [command, ...args].join(' ').toLowerCase();
  
  for (const pattern of policy.requireApprovalFor) {
    if (fullCommand.includes(pattern.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

export function createSafeBinPolicy(overrides: Partial<SafeBinPolicy> = {}): SafeBinPolicy {
  return {
    allowedBins: overrides.allowedBins ?? DEFAULT_ALLOWED_BINS,
    blockedBins: overrides.blockedBins ?? DEFAULT_BLOCKED_BINS,
    allowedPaths: overrides.allowedPaths ?? [],
    blockedPaths: overrides.blockedPaths ?? [],
    requireApprovalFor: overrides.requireApprovalFor ?? DEFAULT_REQUIRE_APPROVAL,
  };
}

export function isPathAllowed(path: string, policy: SafeBinPolicy = DEFAULT_SAFE_BIN_POLICY): boolean {
  if (policy.blockedPaths.some(p => path.startsWith(p))) {
    return false;
  }
  
  if (policy.allowedPaths.length === 0) {
    return true;
  }
  
  return policy.allowedPaths.some(p => path.startsWith(p));
}
