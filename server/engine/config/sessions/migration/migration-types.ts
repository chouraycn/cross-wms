export interface Migration {
  id: string;
  fromVersion: string;
  toVersion: string;
  description: string;
  up: (baseDir: string, archivedDir: string) => Promise<MigrationStepResult>;
  down?: (baseDir: string, archivedDir: string) => Promise<MigrationStepResult>;
}

export interface MigrationStepResult {
  success: boolean;
  migrated: number;
  failed: number;
  errors: string[];
  fromVersion: string;
  toVersion: string;
}

export interface MigrationResult {
  success: boolean;
  migrated: number;
  failed: number;
  errors: string[];
  fromVersion: string;
  toVersion: string;
  appliedMigrations: string[];
}

export interface MigrationStatus {
  currentVersion: string;
  targetVersion: string;
  needsMigration: boolean;
  pendingMigrations: Migration[];
  completedMigrations: Migration[];
}

export interface MigrationOptions {
  targetVersion?: string;
  dryRun?: boolean;
  force?: boolean;
}