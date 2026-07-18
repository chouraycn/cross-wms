import type Database from 'better-sqlite3';
import type { SchemaShape, TableColumn, TableIndex } from './types.js';

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

interface TableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

interface IndexListRow {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

interface IndexInfoRow {
  seqno: number;
  cid: number;
  name: string;
}

interface SqliteMasterRow {
  name: string;
  type: string;
}

function normalizeAutoIndexName(name: string): string {
  return name.startsWith('sqlite_autoindex_') ? 'sqlite_autoindex' : name;
}

export function collectColumns(db: Database.Database, tableName: string): TableColumn[] {
  const rows = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as TableInfoRow[];
  return rows
    .map((row) => ({
      name: row.name,
      type: row.type,
      notNull: row.notnull === 1,
      defaultValue: row.dflt_value,
      primaryKey: row.pk > 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function collectIndexes(db: Database.Database, tableName: string): TableIndex[] {
  const rows = db.prepare(`PRAGMA index_list(${quoteIdentifier(tableName)})`).all() as IndexListRow[];
  return rows
    .map((row) => {
      const indexInfo = db.prepare(`PRAGMA index_info(${quoteIdentifier(row.name)})`).all() as IndexInfoRow[];
      const columns = indexInfo
        .sort((a, b) => a.seqno - b.seqno)
        .map((col) => col.name);
      return {
        name: normalizeAutoIndexName(row.name),
        unique: row.unique === 1,
        origin: row.origin,
        partial: row.partial === 1,
        columns,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function collectSchemaShape(db: Database.Database): SchemaShape {
  const tableRows = db
    .prepare(
      `
      SELECT name, type
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
      `
    )
    .all() as SqliteMasterRow[];

  const tables: SchemaShape['tables'] = {};
  for (const table of tableRows) {
    tables[table.name] = {
      columns: collectColumns(db, table.name),
      indexes: collectIndexes(db, table.name),
    };
  }

  return { tables };
}

export function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { ok?: number } | undefined;
  return row?.ok === 1;
}

export function tableHasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  if (!tableExists(db, tableName)) return false;
  const rows = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as TableInfoRow[];
  return rows.some((row) => row.name === columnName);
}

export function tablePrimaryKeyColumns(db: Database.Database, tableName: string): string[] {
  if (!tableExists(db, tableName)) return [];
  const rows = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as TableInfoRow[];
  return rows
    .filter((row) => row.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((row) => row.name);
}

export function ensureColumn(
  db: Database.Database,
  tableName: string,
  columnDef: string
): boolean {
  const columnName = columnDef.trim().split(/\s+/, 1)[0];
  if (!columnName || !tableExists(db, tableName) || tableHasColumn(db, tableName, columnName)) {
    return false;
  }
  db.exec(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${columnDef};`);
  return true;
}

export function readUserVersion(db: Database.Database): number {
  const result = db.pragma('user_version') as Array<{ user_version: number }> | number;
  if (typeof result === 'number') return result;
  if (Array.isArray(result) && result.length > 0) return result[0].user_version;
  return 0;
}

export function writeUserVersion(db: Database.Database, version: number): void {
  db.pragma(`user_version = ${version}`);
}
