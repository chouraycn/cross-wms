import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  OPENCLAW_ACPX_LEASE_ID_ARG,
  OPENCLAW_GATEWAY_INSTANCE_ID_ARG,
} from "./processLease.js";

const execFileAsync = promisify(execFile);

const GENERATED_WRAPPER_BASENAMES = new Set([
  "codex-acp-wrapper.mjs",
  "claude-agent-acp-wrapper.mjs",
]);

const OPENCLAW_PLUGIN_DEPS_MARKER = "/plugin-runtime-deps/";

const OWNED_ACP_PACKAGE_NAMES = [
  "@zed-industries/codex-acp",
  "@zed-industries/codex-acp-darwin-arm64",
  "@zed-industries/codex-acp-darwin-x64",
  "@zed-industries/codex-acp-linux-arm64",
  "@zed-industries/codex-acp-linux-x64",
  "@zed-industries/codex-acp-win32-arm64",
  "@zed-industries/codex-acp-win32-x64",
  "@agentclientprotocol/claude-agent-acp",
  "acpx",
];

const ACP_PACKAGE_MARKERS = [
  ...OWNED_ACP_PACKAGE_NAMES.map((packageName) => `/node_modules/${packageName}/`),
  "/acpx/dist/",
];

export type AcpxProcessInfo = {
  pid: number;
  ppid: number;
  command: string;
};

export type AcpxProcessCleanupDeps = {
  listProcesses?: () => Promise<AcpxProcessInfo[]>;
  killProcess?: (pid: number, signal: NodeJS.Signals) => void;
  sleep?: (ms: number) => Promise<void>;
};

export type AcpxProcessCleanupResult = {
  inspectedPids: number[];
  terminatedPids: number[];
  skippedReason?: "missing-root" | "not-openclaw-owned" | "unverified-root";
};

export type AcpxStartupReapResult = {
  inspectedPids: number[];
  terminatedPids: number[];
  skippedReason?: "unsupported-platform" | "process-list-unavailable";
};

function normalizePathLike(value: string): string {
  return value.replaceAll("\\", "/");
}

function commandMentionsGeneratedWrapper(command: string): boolean {
  return Array.from(GENERATED_WRAPPER_BASENAMES).some((basename) =>
    command.includes(basename),
  );
}

function commandWrapperBelongsToRoot(
  command: string,
  wrapperRoot: string | undefined,
): boolean {
  if (!wrapperRoot) {
    return true;
  }
  const normalizedCommand = normalizePathLike(command);
  const normalizedRoot = normalizePathLike(wrapperRoot).replace(/\/+$/, "");
  return Array.from(GENERATED_WRAPPER_BASENAMES).some((basename) =>
    normalizedCommand.includes(`${normalizedRoot}/${basename}`),
  );
}

export function isOpenClawLeaseAwareAcpxProcessCommand(params: {
  command: string | undefined;
  wrapperRoot?: string;
}): boolean {
  const command = params.command?.trim();
  if (!command) {
    return false;
  }
  const normalized = normalizePathLike(command);
  return (
    commandMentionsGeneratedWrapper(normalized) &&
    commandWrapperBelongsToRoot(normalized, params.wrapperRoot)
  );
}

function commandsReferToSameRootCommand(
  liveCommand: string,
  storedCommand: string | undefined,
) {
  if (!storedCommand?.trim()) {
    return true;
  }
  return (
    normalizePathLike(liveCommand).trim() ===
    normalizePathLike(storedCommand).trim()
  );
}

function commandOptionEquals(
  parts: string[],
  option: string,
  expected: string | undefined,
): boolean {
  if (!expected) {
    return true;
  }
  const index = parts.indexOf(option);
  return index >= 0 && parts[index + 1] === expected;
}

function liveCommandMatchesLeaseIdentity(params: {
  command: string | undefined;
  expectedLeaseId?: string;
  expectedGatewayInstanceId?: string;
}): boolean {
  if (!params.expectedLeaseId && !params.expectedGatewayInstanceId) {
    return true;
  }
  const parts = splitCommandParts(params.command ?? "");
  return (
    commandOptionEquals(parts, OPENCLAW_ACPX_LEASE_ID_ARG, params.expectedLeaseId) &&
    commandOptionEquals(
      parts,
      OPENCLAW_GATEWAY_INSTANCE_ID_ARG,
      params.expectedGatewayInstanceId,
    )
  );
}

function splitCommandParts(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (char === " " && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

export function isOpenClawOwnedAcpxProcessCommand(params: {
  command: string | undefined;
  wrapperRoot?: string;
}): boolean {
  const command = params.command?.trim();
  if (!command) {
    return false;
  }
  const normalized = normalizePathLike(command);
  if (
    isOpenClawLeaseAwareAcpxProcessCommand({
      command: normalized,
      wrapperRoot: params.wrapperRoot,
    })
  ) {
    return true;
  }
  if (!normalized.includes(OPENCLAW_PLUGIN_DEPS_MARKER)) {
    return false;
  }
  return ACP_PACKAGE_MARKERS.some((marker) => normalized.includes(marker));
}

function parseProcessList(stdout: string): AcpxProcessInfo[] {
  const processes: AcpxProcessInfo[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s*(?<pid>\d+)\s+(?<ppid>\d+)\s+(?<command>.+?)\s*$/.exec(line);
    if (!match?.groups) {
      continue;
    }
    processes.push({
      pid: Number.parseInt(match.groups.pid, 10),
      ppid: Number.parseInt(match.groups.ppid, 10),
      command: match.groups.command,
    });
  }
  return processes;
}

export async function listPlatformProcesses(): Promise<AcpxProcessInfo[]> {
  if (process.platform === "win32") {
    return [];
  }
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,command="], {
    maxBuffer: 8 * 1024 * 1024,
  });
  return parseProcessList(stdout);
}

function collectProcessTree(
  processes: AcpxProcessInfo[],
  rootPid: number,
): AcpxProcessInfo[] {
  const childrenByParent = new Map<number, AcpxProcessInfo[]>();
  for (const processInfo of processes) {
    const children = childrenByParent.get(processInfo.ppid) ?? [];
    children.push(processInfo);
    childrenByParent.set(processInfo.ppid, children);
  }

  const byPid = new Map(processes.map((processInfo) => [processInfo.pid, processInfo]));
  const root = byPid.get(rootPid);
  const collected: AcpxProcessInfo[] = [];
  if (root) {
    collected.push(root);
  }

  const queue = [...(childrenByParent.get(rootPid) ?? [])];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || collected.some((processInfo) => processInfo.pid === next.pid)) {
      continue;
    }
    collected.push(next);
    queue.push(...(childrenByParent.get(next.pid) ?? []));
  }

  return collected;
}

function uniquePids(processes: AcpxProcessInfo[]): number[] {
  return Array.from(
    new Set(
      processes
        .map((processInfo) => processInfo.pid)
        .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid),
    ),
  );
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function terminatePids(
  pids: number[],
  deps: AcpxProcessCleanupDeps | undefined,
): Promise<number[]> {
  const killProcess = deps?.killProcess ?? ((pid, signal) => process.kill(pid, signal));
  const sleep =
    deps?.sleep ??
    ((ms) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }));
  const terminated: number[] = [];

  for (const pid of pids) {
    try {
      killProcess(pid, "SIGTERM");
      terminated.push(pid);
    } catch {
    }
  }
  if (terminated.length === 0) {
    return terminated;
  }
  await sleep(750);
  for (const pid of terminated) {
    if (deps?.killProcess || isProcessAlive(pid)) {
      try {
        killProcess(pid, "SIGKILL");
      } catch {
      }
    }
  }
  return terminated;
}

export async function cleanupOpenClawOwnedAcpxProcessTree(params: {
  rootPid?: number;
  rootCommand?: string;
  expectedLeaseId?: string;
  expectedGatewayInstanceId?: string;
  wrapperRoot?: string;
  deps?: AcpxProcessCleanupDeps;
}): Promise<AcpxProcessCleanupResult> {
  const rootPid = params.rootPid;
  if (!rootPid || rootPid <= 0 || rootPid === process.pid) {
    return { inspectedPids: [], terminatedPids: [], skippedReason: "missing-root" };
  }

  let processes: AcpxProcessInfo[];
  try {
    processes = await (params.deps?.listProcesses ?? listPlatformProcesses)();
  } catch {
    processes = [];
  }

  const listedTree = collectProcessTree(processes, rootPid);
  if (listedTree.length === 0) {
    return { inspectedPids: [], terminatedPids: [], skippedReason: "unverified-root" };
  }
  const rootCommand = listedTree[0]?.command ?? params.rootCommand;
  const liveCommandWasGeneratedWrapper = commandMentionsGeneratedWrapper(
    normalizePathLike(rootCommand ?? ""),
  );
  const storedCommandWasGeneratedWrapper = commandMentionsGeneratedWrapper(
    normalizePathLike(params.rootCommand ?? ""),
  );
  if (!liveCommandWasGeneratedWrapper && storedCommandWasGeneratedWrapper) {
    return {
      inspectedPids: listedTree.map((processInfo) => processInfo.pid),
      terminatedPids: [],
      skippedReason: "not-openclaw-owned",
    };
  }
  if (
    !liveCommandWasGeneratedWrapper &&
    !commandsReferToSameRootCommand(rootCommand ?? "", params.rootCommand)
  ) {
    return {
      inspectedPids: listedTree.map((processInfo) => processInfo.pid),
      terminatedPids: [],
      skippedReason: "not-openclaw-owned",
    };
  }
  if (
    !isOpenClawOwnedAcpxProcessCommand({
      command: rootCommand,
      wrapperRoot: params.wrapperRoot,
    })
  ) {
    return {
      inspectedPids: listedTree.map((processInfo) => processInfo.pid),
      terminatedPids: [],
      skippedReason: "not-openclaw-owned",
    };
  }
  if (
    !liveCommandMatchesLeaseIdentity({
      command: rootCommand,
      expectedLeaseId: params.expectedLeaseId,
      expectedGatewayInstanceId: params.expectedGatewayInstanceId,
    })
  ) {
    return {
      inspectedPids: listedTree.map((processInfo) => processInfo.pid),
      terminatedPids: [],
      skippedReason: "not-openclaw-owned",
    };
  }

  const pids = uniquePids(listedTree.toReversed());
  return {
    inspectedPids: uniquePids(listedTree),
    terminatedPids: await terminatePids(pids, params.deps),
  };
}

export async function reapStaleOpenClawOwnedAcpxOrphans(params: {
  wrapperRoot: string;
  deps?: AcpxProcessCleanupDeps;
}): Promise<AcpxStartupReapResult> {
  if (process.platform === "win32") {
    return {
      inspectedPids: [],
      terminatedPids: [],
      skippedReason: "unsupported-platform",
    };
  }

  let processes: AcpxProcessInfo[];
  try {
    processes = await (params.deps?.listProcesses ?? listPlatformProcesses)();
  } catch {
    return {
      inspectedPids: [],
      terminatedPids: [],
      skippedReason: "process-list-unavailable",
    };
  }

  const orphans = processes.filter(
    (processInfo) =>
      processInfo.ppid === 1 &&
      isOpenClawOwnedAcpxProcessCommand({
        command: processInfo.command,
        wrapperRoot: params.wrapperRoot,
      }),
  );
  const orphanTrees = orphans.map((orphan) => collectProcessTree(processes, orphan.pid));
  const inspectedPids = uniquePids(orphanTrees.flat());
  const pids = uniquePids(orphanTrees.flatMap((tree) => tree.toReversed()));
  return {
    inspectedPids,
    terminatedPids: await terminatePids(pids, params.deps),
  };
}