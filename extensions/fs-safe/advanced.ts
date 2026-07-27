// Stub for @openclaw/fs-safe/advanced
export type MovePathToTrashOptions = {
  fs?: unknown;
  basePath?: string;
};
export async function movePathToTrash(_targetPath: string, _options?: MovePathToTrashOptions): Promise<void> {}
export async function acquireFileLock(_path: string): Promise<{ release: () => Promise<void> }> {
  return { release: async () => {} };
}
export async function withFileLock<T>(_path: string, fn: () => Promise<T>): Promise<T> {
  return fn();
}
