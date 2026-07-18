import type Database from 'better-sqlite3';

export interface StateDBConfig {
  dbPath: string;
  schemaVersion: number;
  busyTimeoutMs: number;
  foreignKeys: boolean;
  synchronous: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
  journalMode: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF';
}

export interface MigrationState {
  version: number;
  name: string;
  appliedAt: number;
  durationMs: number;
  status: 'success' | 'failed' | 'pending';
  error?: string;
}

export interface QueryPlanStep {
  id: number;
  parent: number;
  detail: string;
  table?: string;
  index?: string;
  isScan?: boolean;
  isUsingIndex?: boolean;
  isUsingTempBTree?: boolean;
}

export interface QueryPlan {
  sql: string;
  steps: QueryPlanStep[];
  hasFullTableScan: boolean;
  usesIndex: boolean;
  estimatedCost?: number;
}

export interface SchemaMeta {
  metaKey: string;
  role: string;
  schemaVersion: number;
  agentId?: string | null;
  appVersion?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TableColumn {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: unknown;
  primaryKey: boolean;
}

export interface TableIndex {
  name: string;
  unique: boolean;
  origin: string;
  partial: boolean;
  columns: string[];
}

export interface SchemaShape {
  tables: Record<string, {
    columns: TableColumn[];
    indexes: TableIndex[];
  }>;
}

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
  down?: (db: Database.Database) => void;
}

export interface TablePermission {
  table: string;
  select: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
}

export interface RowLevelPermission {
  table: string;
  column: string;
  condition: string;
}

export interface DBPermissions {
  role: string;
  tablePermissions: TablePermission[];
  rowLevelPermissions: RowLevelPermission[];
}

export interface StateDatabaseOptions {
  path?: string;
  env?: NodeJS.ProcessEnv;
}

export interface AgentDatabaseOptions extends StateDatabaseOptions {
  agentId: string;
}

export interface OpenStateDatabase {
  db: Database.Database;
  path: string;
  schemaVersion: number;
}

export interface OpenAgentDatabase extends OpenStateDatabase {
  agentId: string;
}
