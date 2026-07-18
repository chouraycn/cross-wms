import type { Command } from "commander";
import fs from "fs/promises";
import { logger } from "../../logger.js";
import { AppPaths } from "../../config/appPaths.js";

export type ResetScope = "config" | "config+creds+sessions" | "full";

export type ResetOptions = {
  scope?: ResetScope;
  yes?: boolean;
  dryRun?: boolean;
};

const SCOPE_DESCRIPTIONS: Record<ResetScope, { label: string; hint: string }> = {
  "config": { label: "Config only", hint: "config/config.json" },
  "config+creds+sessions": { label: "Config + credentials + sessions", hint: "keeps workspace" },
  "full": { label: "Full reset", hint: "all data" },
};

async function removePath(filePath: string, dryRun: boolean): Promise<void> {
  try {
    await fs.access(filePath);
    if (dryRun) {
      logger.info(`[dry-run] rm -rf ${filePath}`);
    } else {
      await fs.rm(filePath, { recursive: true, force: true });
      logger.info(`Removed: ${filePath}`);
    }
  } catch {
    // File doesn't exist, nothing to remove
  }
}

export async function resetCommand(options: ResetOptions): Promise<void> {
  const scope = options.scope;
  const dryRun = Boolean(options.dryRun);

  if (!scope) {
    logger.error("Missing --scope option.");
    logger.info("Available scopes:");
    for (const [key, value] of Object.entries(SCOPE_DESCRIPTIONS)) {
      logger.info(`  ${key}: ${value.label} (${value.hint})`);
    }
    process.exit(1);
    return;
  }

  if (!Object.keys(SCOPE_DESCRIPTIONS).includes(scope)) {
    logger.error(`Invalid --scope: ${scope}`);
    logger.info("Expected: config, config+creds+sessions, or full");
    process.exit(1);
    return;
  }

  if (!options.yes && !dryRun) {
    logger.warn(`WARNING: This will ${SCOPE_DESCRIPTIONS[scope].label.toLowerCase()}`);
    logger.warn("Run with --yes to confirm, or --dry-run to preview.");
    process.exit(1);
    return;
  }

  logger.info(`Performing ${scope} reset...`);

  if (scope === "config") {
    await removePath(AppPaths.userConfigFile, dryRun);
    await removePath(AppPaths.configSchemaFile, dryRun);
    logger.info("Done.");
    return;
  }

  if (scope === "config+creds+sessions") {
    await removePath(AppPaths.userConfigFile, dryRun);
    await removePath(AppPaths.configSchemaFile, dryRun);
    await removePath(AppPaths.sessionsDir, dryRun);
    await removePath(AppPaths.archivedSessionsDir, dryRun);
    logger.info("Done.");
    logger.info("Next: run 'cdfknow config init' to reconfigure.");
    return;
  }

  if (scope === "full") {
    await removePath(AppPaths.rootDir, dryRun);
    logger.info("Done.");
    logger.info("Next: run 'cdfknow config init' to reconfigure.");
    return;
  }
}

export function registerResetCommand(program: Command): void {
  program
    .command("reset")
    .description("重置配置或数据")
    .option("--scope <scope>", "重置范围: config, config+creds+sessions, full")
    .option("--yes", "确认重置操作")
    .option("--dry-run", "仅预览要删除的文件")
    .action(async (options: ResetOptions) => {
      await resetCommand(options);
    });
}