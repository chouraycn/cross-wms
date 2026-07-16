import { join, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';

export type TrajectoryPaths = {
  rootDir: string;
  sessionDir: string;
  entryFile: string;
};

export function resolveTrajectoryPath(sessionId: string): TrajectoryPaths {
  const envRoot = process.env.OPENCLAW_TRAJECTORY_DIR;
  const rootDir = envRoot
    ? resolve(envRoot)
    : join(homedir(), '.openclaw', 'trajectories');
  const sessionDir = join(rootDir, sessionId);
  const entryFile = join(sessionDir, 'trajectory.jsonl');
  return { rootDir, sessionDir, entryFile };
}

export async function ensureTrajectoryDir(sessionId: string): Promise<TrajectoryPaths> {
  const paths = resolveTrajectoryPath(sessionId);
  await mkdir(paths.sessionDir, { recursive: true });
  return paths;
}
