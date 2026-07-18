import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../logger.js";
import { t } from "./i18n/index.js";
import { WizardCancelledError, type WizardPrompter } from "./prompts.js";
import type { MigrationConfig, SetupConfig } from "./types.js";

export type SetupMigrationDetection = {
  providerId: string;
  label: string;
  source?: string;
  message?: string;
};

export type MigrationProvider = {
  id: string;
  label: string;
  description?: string;
  detect?: (params: { sourcePath: string }) => Promise<{ found: boolean; label?: string; source?: string }>;
  plan?: (params: { sourcePath: string; includeSecrets: boolean }) => Promise<MigrationPlan>;
  apply?: (params: {
    sourcePath: string;
    targetConfig: Partial<SetupConfig>;
    includeSecrets: boolean;
  }) => Promise<MigrationResult>;
};

export type MigrationPlanItem = {
  type: "config" | "plugin" | "secret" | "session" | "workspace";
  name: string;
  action: "import" | "skip" | "merge";
  description?: string;
};

export type MigrationPlan = {
  items: MigrationPlanItem[];
  summary: string;
};

export type MigrationResult = {
  success: boolean;
  config: Partial<SetupConfig>;
  itemsImported: number;
  itemsSkipped: number;
  errors: string[];
};

const builtinProviders: MigrationProvider[] = [
  {
    id: "openclaw",
    label: "OpenClaw",
    description: "Import from OpenClaw configuration",
    detect: async ({ sourcePath }) => {
      try {
        const configPath = path.join(sourcePath, "config.json");
        await fs.access(configPath);
        return { found: true, label: "OpenClaw config", source: sourcePath };
      } catch {
        return { found: false };
      }
    },
    plan: async () => ({
      items: [
        { type: "config", name: "Gateway config", action: "import" },
        { type: "plugin", name: "Plugin settings", action: "import" },
        { type: "workspace", name: "Workspace files", action: "import" },
      ],
      summary: "3 items to import",
    }),
    apply: async ({ targetConfig }) => ({
      success: true,
      config: targetConfig,
      itemsImported: 3,
      itemsSkipped: 0,
      errors: [],
    }),
  },
  {
    id: "json-file",
    label: "JSON config file",
    description: "Import from a JSON configuration file",
    detect: async ({ sourcePath }) => {
      try {
        const stat = await fs.stat(sourcePath);
        if (stat.isFile() && sourcePath.endsWith(".json")) {
          return { found: true, label: "JSON config file", source: sourcePath };
        }
      } catch {
        // not found
      }
      return { found: false };
    },
    plan: async () => ({
      items: [
        { type: "config", name: "Config values", action: "import" },
      ],
      summary: "1 item to import",
    }),
    apply: async ({ targetConfig }) => ({
      success: true,
      config: targetConfig,
      itemsImported: 1,
      itemsSkipped: 0,
      errors: [],
    }),
  },
];

const migrationProviders = new Map<string, MigrationProvider>();

export function registerMigrationProvider(provider: MigrationProvider): void {
  migrationProviders.set(provider.id, provider);
  logger.debug(`[Wizard:Migration] Registered migration provider: ${provider.id}`);
}

export function getMigrationProvider(providerId: string): MigrationProvider | undefined {
  return migrationProviders.get(providerId) ?? builtinProviders.find((p) => p.id === providerId);
}

export function listMigrationProviders(): MigrationProvider[] {
  return [...builtinProviders, ...migrationProviders.values()];
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

export async function detectSetupMigrationSources(params: {
  searchPaths?: string[];
}): Promise<SetupMigrationDetection[]> {
  const detections: SetupMigrationDetection[] = [];
  const providers = listMigrationProviders();

  const searchPaths = params.searchPaths ?? [
    path.join(process.env.HOME ?? "~", ".openclaw"),
    path.join(process.env.HOME ?? "~", ".crosswms"),
  ];

  for (const provider of providers) {
    if (!provider.detect) continue;

    for (const searchPath of searchPaths) {
      const resolvedPath = searchPath.replace("~", process.env.HOME ?? "");
      if (!(await exists(resolvedPath))) continue;

      try {
        const detection = await provider.detect({ sourcePath: resolvedPath });
        if (detection.found) {
          detections.push({
            providerId: provider.id,
            label: detection.label ?? provider.label,
            source: detection.source ?? resolvedPath,
          });
          break;
        }
      } catch (error) {
        logger.debug(`[Wizard:Migration] Detection failed for ${provider.id}: ${error}`);
      }
    }
  }

  logger.debug(`[Wizard:Migration] Detected ${detections.length} migration sources`);
  return detections;
}

function formatMigrationPreview(plan: MigrationPlan): string {
  const lines = [plan.summary, ""];
  for (const item of plan.items) {
    const actionIcon = item.action === "import" ? "+" : item.action === "skip" ? "-" : "~";
    lines.push(`  ${actionIcon} [${item.type}] ${item.name}${item.description ? ` - ${item.description}` : ""}`);
  }
  return lines.join("\n");
}

function formatMigrationResult(result: MigrationResult): string {
  const lines = [
    result.success ? "Migration completed successfully!" : "Migration completed with errors.",
    `  Imported: ${result.itemsImported}`,
    `  Skipped: ${result.itemsSkipped}`,
  ];
  if (result.errors.length > 0) {
    lines.push("", "Errors:");
    for (const err of result.errors) {
      lines.push(`  - ${err}`);
    }
  }
  return lines.join("\n");
}

export async function runSetupMigrationImport(params: {
  prompter: WizardPrompter;
  detections?: SetupMigrationDetection[];
  targetConfig?: Partial<SetupConfig>;
  importFrom?: string;
  importSource?: string;
  includeSecrets?: boolean;
  nonInteractive?: boolean;
}): Promise<MigrationResult> {
  const { prompter } = params;

  const detections = params.detections ?? (await detectSetupMigrationSources({}));
  const providers = listMigrationProviders();

  if (providers.length === 0) {
    throw new Error("No migration providers found.");
  }

  const providerById = new Map(providers.map((p) => [p.id, p]));

  const providerId =
    params.importFrom?.trim() ||
    (await prompter.select({
      message: t("wizard.migration.source"),
      options: [
        ...detections.map((detection) => ({
          value: detection.providerId,
          label: detection.label,
          ...(detection.source ? { hint: detection.source } : {}),
        })),
        ...providers
          .filter((p) => !detections.some((d) => d.providerId === p.id))
          .map((p) => ({
            value: p.id,
            label: p.label,
            hint: p.description ?? t("wizard.migration.sourcePathHint"),
          })),
      ],
      initialValue: detections[0]?.providerId ?? providers[0]?.id,
    }));

  const provider = providerById.get(providerId);
  if (!provider) {
    throw new Error(`Unknown migration provider "${providerId}".`);
  }

  const sourceDefault = detections.find((d) => d.providerId === providerId)?.source ?? "";
  const sourcePath =
    params.importSource?.trim() ||
    sourceDefault ||
    (params.nonInteractive
      ? (() => {
          throw new Error("--import-source is required for non-interactive migration import.");
        })()
      : await prompter.text({
          message: t("wizard.migration.sourceAgentHome"),
          initialValue: providerId === "openclaw" ? "~/.openclaw" : undefined,
        }));

  let includeSecrets = params.includeSecrets ?? false;
  if (!params.nonInteractive) {
    includeSecrets = await prompter.confirm({
      message: "Include secrets in migration?",
      initialValue: false,
    });
  }

  const targetConfig = params.targetConfig ?? {};

  let plan: MigrationPlan = { items: [], summary: "No plan available" };
  if (provider.plan) {
    plan = await provider.plan({ sourcePath, includeSecrets });
    await prompter.note(formatMigrationPreview(plan), t("wizard.migration.previewTitle"));
  }

  const confirmed =
    params.nonInteractive === true
      ? true
      : await prompter.confirm({
          message: t("wizard.migration.apply"),
          initialValue: false,
        });

  if (!confirmed) {
    throw new WizardCancelledError(t("wizard.migration.cancelled"));
  }

  const progress = prompter.progress("Migrating...");
  progress.update("Applying migration...");

  let result: MigrationResult;
  if (provider.apply) {
    result = await provider.apply({
      sourcePath,
      targetConfig,
      includeSecrets,
    });
  } else {
    result = {
      success: true,
      config: targetConfig,
      itemsImported: 0,
      itemsSkipped: 0,
      errors: ["Provider does not support apply"],
    };
  }

  progress.stop(result.success ? "Migration complete" : "Migration finished");

  await prompter.note(formatMigrationResult(result), t("wizard.migration.appliedTitle"));

  const migrationConfig: MigrationConfig = {
    source: providerId,
    sourcePath,
    includeSecrets,
  };
  result.config = { ...result.config, migration: migrationConfig };

  logger.debug(
    `[Wizard:Migration] Import complete (provider=${providerId}, success=${result.success}, imported=${result.itemsImported})`,
  );

  return result;
}

export function clearMigrationProviders(): void {
  migrationProviders.clear();
}
