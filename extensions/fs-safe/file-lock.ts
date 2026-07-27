// Stub for @openclaw/fs-safe/file-lock
export type FileLockHandle = { release: () => Promise<void> };
export async function acquireFileLock(_path: string): Promise<FileLockHandle> {
  return { release: async () => {} };
}
export async function withFileLock<T>(_path: string, fn: () => Promise<T>): Promise<T> {
  return fn();
}
