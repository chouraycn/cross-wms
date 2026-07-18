import type { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { logger } from "../../logger.js";
import { AppPaths } from "../../config/appPaths.js";

export type BackupOptions = {
  output?: string;
  dryRun?: boolean;
  includeWorkspace?: boolean;
  onlyConfig?: boolean;
  json?: boolean;
};

export type BackupAsset = {
  kind: "config" | "state" | "data" | "workspace";
  sourcePath: string;
  displayPath: string;
};

export type BackupCreateResult = {
  createdAt: string;
  archivePath: string;
  dryRun: boolean;
  includeWorkspace: boolean;
  onlyConfig: boolean;
  assets: BackupAsset[];
  skipped: Array<{
    kind: string;
    sourcePath: string;
    displayPath: string;
    reason: string;
  }>;
};

function buildBackupArchiveBasename(nowMs: number): string {
  const date = new Date(nowMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `cdfknow-backup-${year}${month}${day}-${hours}${minutes}${seconds}.zip`;
}

async function resolveBackupPlanFromDisk(params: {
  includeWorkspace: boolean;
  onlyConfig: boolean;
}): Promise<{
  included: BackupAsset[];
  skipped: BackupCreateResult["skipped"];
  stateDir: string;
  configPath: string;
}> {
  const included: BackupAsset[] = [];
  const skipped: BackupCreateResult["skipped"] = [];
  const configPath = AppPaths.userConfigFile;
  const stateDir = AppPaths.rootDir;

  if (await fileExists(configPath)) {
    included.push({ kind: "config", sourcePath: configPath, displayPath: "config/config.json" });
  } else {
    skipped.push({ kind: "config", sourcePath: configPath, displayPath: "config/config.json", reason: "not found" });
  }

  if (!params.onlyConfig) {
    const dataDirs = [
      { kind: "state" as const, path: AppPaths.sessionsDir, display: "sessions/" },
      { kind: "data" as const, path: AppPaths.chatDbFile, display: "chat.db" },
      { kind: "data" as const, path: AppPaths.mainDbFile, display: "data/main.db" },
      { kind: "data" as const, path: AppPaths.mcpDbFile, display: "mcp/mcp_servers.db" },
      { kind: "data" as const, path: AppPaths.settingsFile, display: "settings.json" },
      { kind: "data" as const, path: AppPaths.memoryDir, display: "memory/" },
      { kind: "data" as const, path: AppPaths.modelsDir, display: "ai-models/" },
      { kind: "data" as const, path: AppPaths.skillsDir, display: "skills/" },
      { kind: "data" as const, path: AppPaths.pluginsDir, display: "plugins/" },
    ];

    for (const dir of dataDirs) {
      if (await fileExists(dir.path)) {
        included.push({ kind: dir.kind, sourcePath: dir.path, displayPath: dir.display });
      }
    }

    if (params.includeWorkspace) {
      const workspaceDirs = [
        { kind: "workspace" as const, path: AppPaths.generatedFilesDir, display: "generated-files/" },
        { kind: "workspace" as const, path: AppPaths.uploadsDir, display: "uploads/" },
      ];
      for (const dir of workspaceDirs) {
        if (await fileExists(dir.path)) {
          included.push({ kind: dir.kind, sourcePath: dir.path, displayPath: dir.display });
        }
      }
    }
  }

  return { included, skipped, stateDir, configPath };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isVolatileBackupPath(filePath: string): boolean {
  const volatilePatterns = [
    /\.pid$/,
    /\.socket$/,
    /\.tmp$/,
    /\/tmp\//,
    /\/logs\//,
    /cron.*log/,
    /queue/,
  ];
  return volatilePatterns.some((pattern) => pattern.test(filePath));
}

export function formatBackupCreateSummary(result: BackupCreateResult): string[] {
  const lines = [`Backup archive: ${result.archivePath}`];
  lines.push(`Included ${result.assets.length} path${result.assets.length === 1 ? "" : "s"}:`);
  for (const asset of result.assets) {
    lines.push(`- ${asset.kind}: ${asset.displayPath}`);
  }
  if (result.skipped.length > 0) {
    lines.push(`Skipped ${result.skipped.length} path${result.skipped.length === 1 ? "" : "s"}:`);
    for (const entry of result.skipped) {
      lines.push(`- ${entry.kind}: ${entry.displayPath} (${entry.reason})`);
    }
  }
  if (result.dryRun) {
    lines.push("Dry run only; archive was not written.");
  } else {
    lines.push(`Created ${result.archivePath}`);
  }
  return lines;
}

async function resolveOutputPath(output?: string): Promise<string> {
  const basename = buildBackupArchiveBasename(Date.now());
  if (!output) {
    return path.resolve(process.cwd(), basename);
  }

  const resolved = path.resolve(output);
  try {
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      return path.join(resolved, basename);
    }
  } catch {
    // File or path doesn't exist, fall through to check if it's a directory path
  }

  if (output.endsWith("/") || output.endsWith("\\")) {
    return path.join(resolved, basename);
  }

  return resolved;
}

async function addFileToZip(zip: JSZip, sourcePath: string, displayPath: string): Promise<void> {
  const stat = await fs.stat(sourcePath);
  if (stat.isDirectory()) {
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      const entrySourcePath = path.join(sourcePath, entry.name);
      const entryDisplayPath = path.join(displayPath, entry.name);
      if (!isVolatileBackupPath(entrySourcePath)) {
        await addFileToZip(zip, entrySourcePath, entryDisplayPath);
      }
    }
  } else {
    const content = await fs.readFile(sourcePath);
    zip.file(displayPath, content);
  }
}

async function createBackupArchive(opts: BackupOptions = {}): Promise<BackupCreateResult> {
  const onlyConfig = Boolean(opts.onlyConfig);
  const includeWorkspace = onlyConfig ? false : (opts.includeWorkspace ?? true);
  const plan = await resolveBackupPlanFromDisk({ includeWorkspace, onlyConfig });
  const outputPath = await resolveOutputPath(opts.output);

  if (plan.included.length === 0) {
    throw new Error(onlyConfig ? "No config file found to back up." : "No data found to back up.");
  }

  const createdAt = new Date().toISOString();
  const result: BackupCreateResult = {
    createdAt,
    archivePath: outputPath,
    dryRun: Boolean(opts.dryRun),
    includeWorkspace,
    onlyConfig,
    assets: plan.included,
    skipped: plan.skipped,
  };

  if (opts.dryRun) {
    return result;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const zip = new JSZip();

  const manifest = {
    schemaVersion: 1,
    createdAt,
    platform: process.platform,
    nodeVersion: process.version,
    options: { includeWorkspace, onlyConfig },
    assets: plan.included.map((asset) => ({
      kind: asset.kind,
      sourcePath: asset.sourcePath,
      displayPath: asset.displayPath,
    })),
    skipped: plan.skipped,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  for (const asset of plan.included) {
    await addFileToZip(zip, asset.sourcePath, asset.displayPath);
  }

  const zipContent = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await fs.writeFile(outputPath, zipContent);

  return result;
}

export async function backupCreateCommand(options: BackupOptions): Promise<BackupCreateResult> {
  const result = await createBackupArchive(options);

  if (options.json) {
    logger.info(JSON.stringify(result, null, 2));
  } else {
    for (const line of formatBackupCreateSummary(result)) {
      logger.info(line);
    }
  }

  return result;
}

export function registerBackupCommand(program: Command): void {
  program
    .command("backup")
    .description("创建数据备份归档")
    .option("-o, --output <path>", "备份输出路径")
    .option("--dry-run", "仅模拟备份，不实际创建归档")
    .option("--include-workspace", "包含工作空间文件")
    .option("--only-config", "仅备份配置文件")
    .option("--json", "JSON 输出格式")
    .action(async (options: BackupOptions) => {
      await backupCreateCommand(options);
    });
}