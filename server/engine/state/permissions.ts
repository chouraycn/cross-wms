import type Database from 'better-sqlite3';
import { logger } from '../../logger.js';
import type {
  DBPermissions,
  TablePermission,
  RowLevelPermission,
} from './types.js';

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

export class PermissionManager {
  private db: Database.Database;
  private permissions: Map<string, DBPermissions>;
  private currentRole: string;

  constructor(db: Database.Database) {
    this.db = db;
    this.permissions = new Map();
    this.currentRole = 'admin';
  }

  defineRole(permissions: DBPermissions): void {
    this.permissions.set(permissions.role, permissions);
    logger.debug(`[PermissionManager] Defined role: ${permissions.role}`);
  }

  setRole(role: string): void {
    if (!this.permissions.has(role)) {
      throw new PermissionError(`Role not defined: ${role}`);
    }
    this.currentRole = role;
  }

  getCurrentRole(): string {
    return this.currentRole;
  }

  private getCurrentPermissions(): DBPermissions | undefined {
    return this.permissions.get(this.currentRole);
  }

  canSelect(table: string): boolean {
    if (this.currentRole === 'admin') return true;
    const perms = this.getCurrentPermissions();
    if (!perms) return false;
    const tablePerm = perms.tablePermissions.find((p) => p.table === table);
    return tablePerm?.select ?? false;
  }

  canInsert(table: string): boolean {
    if (this.currentRole === 'admin') return true;
    const perms = this.getCurrentPermissions();
    if (!perms) return false;
    const tablePerm = perms.tablePermissions.find((p) => p.table === table);
    return tablePerm?.insert ?? false;
  }

  canUpdate(table: string): boolean {
    if (this.currentRole === 'admin') return true;
    const perms = this.getCurrentPermissions();
    if (!perms) return false;
    const tablePerm = perms.tablePermissions.find((p) => p.table === table);
    return tablePerm?.update ?? false;
  }

  canDelete(table: string): boolean {
    if (this.currentRole === 'admin') return true;
    const perms = this.getCurrentPermissions();
    if (!perms) return false;
    const tablePerm = perms.tablePermissions.find((p) => p.table === table);
    return tablePerm?.delete ?? false;
  }

  assertCanSelect(table: string): void {
    if (!this.canSelect(table)) {
      throw new PermissionError(`Role '${this.currentRole}' cannot SELECT from '${table}'`);
    }
  }

  assertCanInsert(table: string): void {
    if (!this.canInsert(table)) {
      throw new PermissionError(`Role '${this.currentRole}' cannot INSERT into '${table}'`);
    }
  }

  assertCanUpdate(table: string): void {
    if (!this.canUpdate(table)) {
      throw new PermissionError(`Role '${this.currentRole}' cannot UPDATE '${table}'`);
    }
  }

  assertCanDelete(table: string): void {
    if (!this.canDelete(table)) {
      throw new PermissionError(`Role '${this.currentRole}' cannot DELETE from '${table}'`);
    }
  }

  getRowLevelConditions(table: string): string[] {
    if (this.currentRole === 'admin') return [];
    const perms = this.getCurrentPermissions();
    if (!perms) return [];
    return perms.rowLevelPermissions
      .filter((p) => p.table === table)
      .map((p) => p.condition);
  }

  applyRowLevelFilter(sql: string, table: string): string {
    const conditions = this.getRowLevelConditions(table);
    if (conditions.length === 0) return sql;

    const whereMatch = sql.match(/\bWHERE\b/i);
    if (whereMatch) {
      const insertIndex = whereMatch.index! + whereMatch[0].length;
      return (
        sql.slice(0, insertIndex) +
        ` (${conditions.join(' AND ')}) AND` +
        sql.slice(insertIndex)
      );
    }

    const orderMatch = sql.match(/\bORDER\s+BY\b/i);
    const limitMatch = sql.match(/\bLIMIT\b/i);
    let insertIndex = sql.length;
    if (orderMatch && orderMatch.index !== undefined) {
      insertIndex = Math.min(insertIndex, orderMatch.index);
    }
    if (limitMatch && limitMatch.index !== undefined) {
      insertIndex = Math.min(insertIndex, limitMatch.index);
    }

    return sql.slice(0, insertIndex) + ` WHERE ${conditions.join(' AND ')}` + sql.slice(insertIndex);
  }

  executeWithPermission<T>(
    table: string,
    operation: 'select' | 'insert' | 'update' | 'delete',
    fn: () => T
  ): T {
    switch (operation) {
      case 'select':
        this.assertCanSelect(table);
        break;
      case 'insert':
        this.assertCanInsert(table);
        break;
      case 'update':
        this.assertCanUpdate(table);
        break;
      case 'delete':
        this.assertCanDelete(table);
        break;
    }
    return fn();
  }

  prepareWithPermission(
    table: string,
    operation: 'select' | 'insert' | 'update' | 'delete',
    sql: string
  ): Database.Statement {
    switch (operation) {
      case 'select':
        this.assertCanSelect(table);
        break;
      case 'insert':
        this.assertCanInsert(table);
        break;
      case 'update':
        this.assertCanUpdate(table);
        break;
      case 'delete':
        this.assertCanDelete(table);
        break;
    }
    return this.db.prepare(sql);
  }

  listRoles(): string[] {
    return ['admin', ...Array.from(this.permissions.keys())];
  }

  getRolePermissions(role: string): DBPermissions | undefined {
    if (role === 'admin') {
      return {
        role: 'admin',
        tablePermissions: [],
        rowLevelPermissions: [],
      };
    }
    return this.permissions.get(role);
  }
}

export function createReaderRole(tables: string[]): DBPermissions {
  return {
    role: 'reader',
    tablePermissions: tables.map((table) => ({
      table,
      select: true,
      insert: false,
      update: false,
      delete: false,
    })),
    rowLevelPermissions: [],
  };
}

export function createWriterRole(tables: string[]): DBPermissions {
  return {
    role: 'writer',
    tablePermissions: tables.map((table) => ({
      table,
      select: true,
      insert: true,
      update: true,
      delete: false,
    })),
    rowLevelPermissions: [],
  };
}

export function createScopedRole(
  roleName: string,
  scopeColumn: string,
  scopeValue: string,
  tables: string[]
): DBPermissions {
  return {
    role: roleName,
    tablePermissions: tables.map((table) => ({
      table,
      select: true,
      insert: true,
      update: true,
      delete: false,
    })),
    rowLevelPermissions: tables.map((table) => ({
      table,
      column: scopeColumn,
      condition: `${scopeColumn} = '${scopeValue.replace(/'/g, "''")}'`,
    })),
  };
}
