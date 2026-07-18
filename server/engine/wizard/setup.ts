import { logger } from "../../logger.js";
import { t } from "./i18n/index.js";
import { WizardCancelledError, type WizardPrompter, type WizardSelectOption } from "./prompts.js";
import { configureGatewayForSetup } from "./setup.gateway-config.js";
import {
  discoverConfigurablePlugins,
  pluginConfigsToPluginConfigArray,
  setupPluginConfig,
  type ConfigurablePlugin,
  type PluginConfigUiHint,
} from "./setup.plugin-config.js";
import { detectSetupMigrationSources, runSetupMigrationImport } from "./setup.migration-import.js";
import { finalizeSetupWizard } from "./setup.finalize.js";
import type {
  GatewayConfig,
  PluginConfig,
  SecretInputMode,
  SetupConfig,
  WizardFlow,
  WizardProgress,
  WizardState,
  WizardStep,
} from "./types.js";

export type SetupOptions = {
  flow?: WizardFlow;
  nonInteractive?: boolean;
  acceptRisk?: boolean;
  secretInputMode?: SecretInputMode;
  importFrom?: string;
  importSource?: string;
  importSecrets?: boolean;
  workspace?: string;
  skipChannels?: boolean;
  skipSearch?: boolean;
  skipSkills?: boolean;
  skipHooks?: boolean;
  skipUi?: boolean;
  skipHealth?: boolean;
  installDaemon?: boolean;
  suppressGatewayTokenOutput?: boolean;
  existingConfig?: Partial<SetupConfig>;
  manifestPlugins?: ReadonlyArray<{
    id: string;
    name?: string;
    configUiHints?: Record<string, PluginConfigUiHint>;
    configSchema?: Record<string, unknown>;
    enabled?: boolean;
  }>;
};

export type SetupResult = {
  success: boolean;
  config?: SetupConfig;
  cancelled?: boolean;
  errors: string[];
};

const DEFAULT_WIZARD_STEPS: WizardStep[] = [
  { id: "welcome", title: "Welcome", order: 0, description: "Welcome to the setup wizard" },
  { id: "flow", title: "Setup Mode", order: 1, description: "Choose quickstart or advanced mode" },
  { id: "gateway", title: "Gateway", order: 2, description: "Configure gateway settings" },
  { id: "plugins", title: "Plugins", order: 3, description: "Configure plugins", skipable: true },
  { id: "finalize", title: "Finalize", order: 4, description: "Complete setup" },
];

export function createInitialWizardState(config?: Partial<SetupConfig>): WizardState {
  return {
    currentStepIndex: 0,
    steps: [...DEFAULT_WIZARD_STEPS],
    config: config ?? {},
    completed: false,
    cancelled: false,
    errors: [],
  };
}

export function getWizardProgress(state: WizardState): WizardProgress {
  const current = state.currentStepIndex + 1;
  const total = state.steps.length;
  return {
    current,
    total,
    percentage: total > 0 ? Math.round((current / total) * 100) : 0,
  };
}

export function getCurrentStep(state: WizardState): WizardStep | null {
  return state.steps[state.currentStepIndex] ?? null;
}

export function advanceStep(state: WizardState): WizardState {
  if (state.currentStepIndex >= state.steps.length - 1) {
    return { ...state, completed: true };
  }
  return { ...state, currentStepIndex: state.currentStepIndex + 1 };
}

export function goToPreviousStep(state: WizardState): WizardState {
  if (state.currentStepIndex <= 0) {
    return state;
  }
  return { ...state, currentStepIndex: state.currentStepIndex - 1 };
}

async function requireRiskAcknowledgement(params: {
  opts: SetupOptions;
  prompter: WizardPrompter;
}): Promise<void> {
  if (params.opts.acceptRisk === true) {
    return;
  }

  await params.prompter.note(
    "This software has full access to your computer when running.\n" +
      "Only grant access to people you trust.\n" +
      "Review the security documentation for more information.",
    "Security Notice",
  );

  const ok = await params.prompter.confirm({
    message: "I understand the risks and want to continue",
    initialValue: false,
  });
  if (!ok) {
    throw new WizardCancelledError(t("wizard.setup.riskNotAccepted"));
  }
}

function hasExistingConfig(config: Partial<SetupConfig>): boolean {
  return (
    config.gateway !== undefined ||
    (config.plugins !== undefined && config.plugins.length > 0) ||
    (config.secrets !== undefined && Object.keys(config.secrets).length > 0)
  );
}

function summarizeExistingConfig(config: Partial<SetupConfig>): string {
  const lines: string[] = [];

  if (config.gateway) {
    lines.push(`Gateway: port=${config.gateway.port}, bind=${config.gateway.bind}`);
    lines.push(`  Auth: ${config.gateway.authMode}`);
  }

  if (config.plugins && config.plugins.length > 0) {
    lines.push(`Plugins: ${config.plugins.length} configured`);
  }

  if (lines.length === 0) {
    lines.push("No existing configuration found.");
  }

  return lines.join("\n");
}

export async function runSetupWizard(
  opts: SetupOptions,
  prompter: WizardPrompter,
): Promise<SetupResult> {
  const errors: string[] = [];
  let config: Partial<SetupConfig> = opts.existingConfig ?? {};

  logger.info("[Wizard:Setup] Starting setup wizard");

  try {
    await prompter.intro(t("wizard.setup.intro"));
    await requireRiskAcknowledgement({ opts, prompter });

    const migrationDetections = await detectSetupMigrationSources({});
    const firstMigrationDetection = migrationDetections[0];

    if (hasExistingConfig(config)) {
      await prompter.note(
        summarizeExistingConfig(config),
        t("wizard.setup.existingConfigTitle"),
      );

      const action = await prompter.select({
        message: t("wizard.setup.configHandling"),
        options: [
          { value: "keep", label: t("wizard.setup.keepCurrent") },
          { value: "modify", label: t("wizard.setup.modifyCurrent") },
          { value: "reset", label: t("wizard.setup.resetBefore") },
        ],
      });

      if (action === "reset") {
        const resetScope = await prompter.select({
          message: t("wizard.setup.resetScope"),
          options: [
            { value: "config", label: t("wizard.setup.resetConfig") },
            {
              value: "config+creds",
              label: t("wizard.setup.resetConfigCredsSessions"),
            },
            {
              value: "full",
              label: t("wizard.setup.resetFull"),
            },
          ],
        });

        if (resetScope === "full") {
          config = {};
        } else if (resetScope === "config+creds") {
          config = { flow: config.flow };
        }
      }
    }

    const importOption: WizardSelectOption<"import" | WizardFlow> | undefined = firstMigrationDetection
      ? {
          value: "import",
          label: `Import from ${firstMigrationDetection.label}`,
          ...(firstMigrationDetection.source ? { hint: firstMigrationDetection.source } : {}),
        }
      : undefined;

    const explicitFlowRaw = opts.flow?.trim();
    const flow: WizardFlow | "import" =
      explicitFlowRaw === "quickstart" || explicitFlowRaw === "advanced"
        ? explicitFlowRaw
        : opts.importFrom
          ? "import"
          : await prompter.select<WizardFlow | "import">({
              message: t("wizard.setup.setupMode"),
              options: [
                {
                  value: "quickstart",
                  label: t("wizard.setup.flowQuickstart"),
                  hint: t("wizard.setup.flowQuickstartHint"),
                },
                {
                  value: "advanced",
                  label: t("wizard.setup.flowAdvanced"),
                  hint: t("wizard.setup.flowAdvancedHint"),
                },
                ...(importOption ? [importOption] : []),
              ],
              initialValue: "quickstart",
            });

    if (flow === "import" || opts.importFrom) {
      const migrationResult = await runSetupMigrationImport({
        prompter,
        detections: migrationDetections,
        targetConfig: config,
        importFrom: opts.importFrom,
        importSource: opts.importSource,
        includeSecrets: opts.importSecrets,
        nonInteractive: opts.nonInteractive,
      });

      if (migrationResult.config) {
        config = migrationResult.config;
      }
      errors.push(...migrationResult.errors);

      if (!migrationResult.success) {
        return { success: false, config: config as SetupConfig, errors };
      }
    }

    const wizardFlow: WizardFlow = flow === "import" ? "advanced" : flow;

    const workspaceDir =
      opts.workspace ??
      (flow === "quickstart"
        ? "~/crosswms-workspace"
        : await prompter.text({
            message: t("wizard.setup.workspaceDirectory"),
            initialValue: "~/crosswms-workspace",
          }));

    const gatewayResult = await configureGatewayForSetup({
      flow: wizardFlow,
      baseConfig: config.gateway,
      secretInputMode: opts.secretInputMode,
      prompter,
    });

    let plugins: PluginConfig[] = config.plugins ?? [];
    if (opts.skipChannels) {
      await prompter.note(t("wizard.setup.skipChannels"), t("wizard.setup.channelsTitle"));
    } else if (opts.manifestPlugins && opts.manifestPlugins.length > 0) {
      const configurable = discoverConfigurablePlugins({
        manifestPlugins: opts.manifestPlugins,
      });

      if (configurable.length > 0) {
        const existingConfigs: Record<string, Record<string, unknown>> = {};
        for (const plugin of plugins) {
          existingConfigs[plugin.id] = plugin.config;
        }

        const updatedConfigs = await setupPluginConfig({
          manifestPlugins: opts.manifestPlugins,
          existingConfigs,
          prompter,
        });

        plugins = pluginConfigsToPluginConfigArray(updatedConfigs, opts.manifestPlugins);
      }
    }

    const secrets: Record<string, string> = config.secrets ?? {};

    const finalConfig: SetupConfig = {
      flow: wizardFlow,
      gateway: gatewayResult.config,
      plugins,
      secrets,
      ...(config.migration ? { migration: config.migration } : {}),
    };

    const finalizeResult = await finalizeSetupWizard({
      flow: wizardFlow,
      config: finalConfig,
      prompter,
      workspaceDir,
      installDaemon: opts.installDaemon,
      skipHealth: opts.skipHealth,
      skipUi: opts.skipUi,
      suppressGatewayTokenOutput: opts.suppressGatewayTokenOutput,
    });

    if (!finalizeResult.success) {
      errors.push("Finalization failed");
    }

    logger.info("[Wizard:Setup] Setup completed successfully");

    return {
      success: errors.length === 0,
      config: finalConfig,
      errors,
    };
  } catch (error) {
    if (error instanceof WizardCancelledError) {
      logger.info("[Wizard:Setup] Setup cancelled by user");
      return {
        success: false,
        cancelled: true,
        errors: [error.message],
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[Wizard:Setup] Setup failed: ${errorMessage}`);
    errors.push(errorMessage);

    return {
      success: false,
      config: config as SetupConfig,
      errors,
    };
  }
}

export function validateSetupConfig(config: Partial<SetupConfig>): string[] {
  const errors: string[] = [];

  if (!config.flow) {
    errors.push("flow is required");
  }

  if (!config.gateway) {
    errors.push("gateway config is required");
  } else {
    if (typeof config.gateway.port !== "number") {
      errors.push("gateway.port must be a number");
    } else if (config.gateway.port < 1 || config.gateway.port > 65535) {
      errors.push("gateway.port must be between 1 and 65535");
    }
    if (!config.gateway.bind) {
      errors.push("gateway.bind is required");
    }
    if (!config.gateway.authMode) {
      errors.push("gateway.authMode is required");
    }
    if (config.gateway.authMode === "token" && !config.gateway.token) {
      errors.push("gateway.token is required when authMode is token");
    }
    if (config.gateway.authMode === "password" && !config.gateway.password) {
      errors.push("gateway.password is required when authMode is password");
    }
  }

  if (!config.plugins) {
    errors.push("plugins array is required");
  }

  if (!config.secrets) {
    errors.push("secrets object is required");
  }

  return errors;
}
