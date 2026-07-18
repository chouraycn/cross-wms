// SQLite 数据库文件路径工具。
// 直接移植自 openclaw/src/infra/sqlite-files.ts，无外部依赖。
/** SQLite 主数据库加上每个 journal 模式 sidecar，这些 sidecar 可能包含数据库页。 */
export const SQLITE_DATABASE_FILE_SUFFIXES = ["", "-wal", "-shm", "-journal"] as const;

/** 解析主数据库和所有可能的 journal 模式 sidecar 路径。 */
export function resolveSqliteDatabaseFilePaths(pathname: string): string[] {
  return SQLITE_DATABASE_FILE_SUFFIXES.map((suffix) => `${pathname}${suffix}`);
}
