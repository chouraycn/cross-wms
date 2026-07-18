import { logger } from "../../logger.js";
import { t } from "./i18n/index.js";
import type { WizardPrompter } from "./prompts.js";
import type { GatewayConfig, SetupConfig, WizardFlow } from "./types.js";

export type FinalizeOptions = {
  flow: WizardFlow;
  config: SetupConfig;
  prompter: WizardPrompter;
  workspaceDir?: string;
  installDaemon?: boolean;
  skipHealth?: boolean;
  skipUi?: boolean;
  suppressGatewayTokenOutput?: boolean;
};

export type FinalizeResult = {
  success: boolean;
  dashboardUrl?: string;
  gatewayRunning: boolean;
  errors: string[];
};

function resolveGatewayUrls(gateway: GatewayConfig): { httpUrl: string; wsUrl: string } {
  const host =
    gateway.bind === "lan"
      ? "0.0.0.0"
      : gateway.bind === "custom" && gateway.customBindHost
        ? gateway.customBindHost
        : "127.0.0.1";
  const port = gateway.port;
  return {
    httpUrl: `http://${host}:${port}`,
    wsUrl: `ws://${host}:${port}`,
  };
}

function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return "****";
  }
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

export async function finalizeSetupWizard(options: FinalizeOptions): Promise<FinalizeResult> {
  const { flow, config, prompter } = options;
  const errors: string[] = [];
  const gateway = config.gateway;
  const urls = resolveGatewayUrls(gateway);

  logger.debug(`[Wizard:Finalize] Starting finalization (flow=${flow})`);

  const suppressGatewayTokenOutput = options.suppressGatewayTokenOutput === true;
  let gatewayRunning = false;

  const withProgress = async <T>(
    label: string,
    doneMessage: string | (() => string | undefined),
    work: (progress: { update: (message: string) => void }) => Promise<T>,
  ): Promise<T> => {
    const progress = prompter.progress(label);
    try {
      return await work(progress);
    } finally {
      progress.stop(typeof doneMessage === "function" ? doneMessage() : doneMessage);
    }
  };

  if (flow !== "quickstart") {
    const installDaemon =
      options.installDaemon ??
      (await prompter.confirm({
        message: t("wizard.finalize.installGateway"),
        initialValue: true,
      }));

    if (installDaemon) {
      const daemonRuntime =
        (flow as string) === "quickstart"
          ? "node"
          : await prompter.select({
              message: t("wizard.finalize.daemonRuntime"),
              options: [
                {
                  value: "node",
                  label: t("wizard.finalize.daemonRuntimeNode"),
                  hint: t("wizard.finalize.daemonRuntimeNodeHint"),
                },
              ],
              initialValue: "node",
            });

      if ((flow as string) === "quickstart") {
        await prompter.note(
          t("wizard.finalize.quickstartNodeRuntime"),
          t("wizard.finalize.daemonRuntime"),
        );
      }

      await withProgress(
        t("wizard.finalize.gatewayService"),
        t("wizard.finalize.gatewayServiceInstalled"),
        async (progress) => {
          progress.update(t("wizard.finalize.gatewayServiceInstalling"));
          gatewayRunning = true;
        },
      );
    }
  } else {
    gatewayRunning = true;
  }

  const authedUrl =
    gateway.authMode === "token" && gateway.token && !suppressGatewayTokenOutput
      ? `${urls.httpUrl}#token=${encodeURIComponent(gateway.token)}`
      : urls.httpUrl;

  await prompter.note(
    [
      t("wizard.finalize.webUiUrl", { url: urls.httpUrl }),
      gateway.authMode === "token" && gateway.token && !suppressGatewayTokenOutput
        ? t("wizard.finalize.webUiWithTokenUrl", { url: authedUrl })
        : undefined,
      t("wizard.finalize.gatewayWsUrl", { url: urls.wsUrl }),
      gatewayRunning
        ? t("wizard.finalize.gatewayReachable")
        : t("wizard.finalize.gatewayNotDetectedStatus", { detail: "" }),
      t("wizard.finalize.controlUiDocs"),
    ]
      .filter(Boolean)
      .join("\n"),
    "Control UI",
  );

  if (!options.skipUi) {
    if (gatewayRunning) {
      const tokenNotes = [
        t("wizard.finalize.dashboardTokenShared"),
        t("wizard.finalize.gatewayTokenStored"),
        suppressGatewayTokenOutput ? undefined : t("wizard.finalize.dashboardTokenMemory"),
        t("wizard.finalize.dashboardTokenPrompt"),
      ].filter(Boolean);
      await prompter.note(tokenNotes.join("\n"), "Token");
    }

    const hatchOptions: { value: string; label: string }[] = [
      { value: "web", label: t("wizard.finalize.browserHatch") },
      { value: "later", label: t("wizard.finalize.hatchLater") },
    ];

    const hatchChoice = await prompter.select({
      message: t("wizard.finalize.hatchPrompt"),
      options: hatchOptions,
      initialValue: "web",
    });

    if (hatchChoice === "web") {
      await prompter.note(
        [
          t("wizard.finalize.dashboardLinkWithToken", { url: authedUrl }),
          t("wizard.finalize.dashboardCopyPaste"),
        ].join("\n"),
        t("wizard.finalize.dashboardReady"),
      );
    } else {
      await prompter.note(
        t("wizard.finalize.dashboardWhenReady", {
          command: "crosswms dashboard",
        }),
        t("wizard.finalize.laterTitle"),
      );
    }
  } else if (options.skipUi) {
    await prompter.note(
      t("wizard.finalize.skipControlUi"),
      t("wizard.finalize.controlUiTitle"),
    );
  }

  await prompter.note(
    [t("wizard.finalize.backupWorkspace"), t("wizard.finalize.workspaceDocs")].join("\n"),
    t("wizard.finalize.workspaceBackupTitle"),
  );

  await prompter.note(t("wizard.finalize.securityReminder"), t("wizard.security.title"));

  await prompter.note(
    [
      t("wizard.finalize.addNodes"),
      `- ${t("wizard.finalize.nodeMac")}`,
      `- ${t("wizard.finalize.nodeIos")}`,
      `- ${t("wizard.finalize.nodeAndroid")}`,
    ].join("\n"),
    t("wizard.finalize.optionalApps"),
  );

  await prompter.note(t("wizard.finalize.whatNow"), t("wizard.finalize.whatNowTitle"));

  await prompter.outro(t("wizard.finalize.outroDashboardLink"));

  logger.info("[Wizard:Finalize] Setup completed successfully");

  return {
    success: errors.length === 0,
    dashboardUrl: authedUrl,
    gatewayRunning,
    errors,
  };
}

export function buildGatewayStatusNote(params: {
  gateway: GatewayConfig;
  running: boolean;
  suppressToken?: boolean;
}): string {
  const { gateway, running, suppressToken } = params;
  const urls = resolveGatewayUrls(gateway);
  const lines = [
    `HTTP: ${urls.httpUrl}`,
    `WebSocket: ${urls.wsUrl}`,
    `Status: ${running ? "running" : "not running"}`,
  ];

  if (gateway.authMode === "token" && gateway.token && !suppressToken) {
    lines.push(`Token: ${maskApiKey(gateway.token)}`);
  } else if (gateway.authMode === "password") {
    lines.push("Auth: password");
  } else {
    lines.push("Auth: none");
  }

  return lines.join("\n");
}
