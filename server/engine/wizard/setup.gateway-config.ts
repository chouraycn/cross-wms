import { logger } from "../../logger.js";
import { t } from "./i18n/index.js";
import type { WizardPrompter } from "./prompts.js";
import type {
  GatewayAuthMode,
  GatewayBindMode,
  GatewayConfig,
  GatewayTailscaleMode,
  SecretInputMode,
  WizardFlow,
} from "./types.js";
import { resolveSetupSecretInputString } from "./setup.secret-input.js";

export type ConfigureGatewayOptions = {
  flow: WizardFlow;
  baseConfig?: Partial<GatewayConfig>;
  secretInputMode?: SecretInputMode;
  prompter: WizardPrompter;
};

export type ConfigureGatewayResult = {
  config: GatewayConfig;
};

function normalizeWizardTextInput(value: unknown): string {
  if (typeof value === "number") {
    return String(value);
  }
  return typeof value === "string" ? value.trim() : "";
}

export function validateGatewayPortInput(value: unknown): string | undefined {
  const port = Number(normalizeWizardTextInput(value));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return "Port must be a number between 1 and 65535";
  }
  return undefined;
}

export function validateGatewayPasswordInput(value: unknown): string | undefined {
  const str = normalizeWizardTextInput(value);
  if (str.length < 8) {
    return "Password must be at least 8 characters";
  }
  return undefined;
}

export function validateIPv4AddressInput(value: unknown): string | undefined {
  const str = normalizeWizardTextInput(value);
  const parts = str.split(".");
  if (parts.length !== 4) {
    return "Please enter a valid IPv4 address (e.g., 192.168.1.1)";
  }
  for (const part of parts) {
    const num = Number(part);
    if (!Number.isInteger(num) || num < 0 || num > 255) {
      return "Please enter a valid IPv4 address (e.g., 192.168.1.1)";
    }
  }
  return undefined;
}

function generateRandomToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  for (let i = 0; i < array.length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return "****";
  }
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

export async function configureGatewayForSetup(
  opts: ConfigureGatewayOptions,
): Promise<ConfigureGatewayResult> {
  const { flow, prompter } = opts;
  const baseConfig = opts.baseConfig ?? {};

  const hasExisting =
    typeof baseConfig.port === "number" ||
    baseConfig.bind !== undefined ||
    baseConfig.authMode !== undefined ||
    baseConfig.token !== undefined ||
    baseConfig.password !== undefined ||
    baseConfig.customBindHost !== undefined ||
    baseConfig.tailscaleMode !== undefined;

  const defaultPort = baseConfig.port ?? 3000;
  const defaultBind: GatewayBindMode =
    baseConfig.bind === "loopback" ||
    baseConfig.bind === "lan" ||
    baseConfig.bind === "auto" ||
    baseConfig.bind === "custom" ||
    baseConfig.bind === "tailnet"
      ? baseConfig.bind
      : "loopback";
  const defaultAuthMode: GatewayAuthMode =
    baseConfig.authMode === "token" || baseConfig.authMode === "password" || baseConfig.authMode === "none"
      ? baseConfig.authMode
      : "token";
  const defaultTailscaleMode: GatewayTailscaleMode =
    baseConfig.tailscaleMode === "off" ||
    baseConfig.tailscaleMode === "serve" ||
    baseConfig.tailscaleMode === "funnel"
      ? baseConfig.tailscaleMode
      : "off";

  logger.debug(`[Wizard:GatewayConfig] Starting gateway config (flow=${flow}, hasExisting=${hasExisting})`);

  const port =
    flow === "quickstart"
      ? defaultPort
      : Number.parseInt(
          normalizeWizardTextInput(
            await prompter.text({
              message: t("wizard.gateway.port"),
              initialValue: String(defaultPort),
              validate: validateGatewayPortInput,
            }),
          ),
          10,
        );

  let bind: GatewayBindMode =
    flow === "quickstart"
      ? defaultBind
      : await prompter.select<GatewayBindMode>({
          message: t("wizard.gateway.bindAddress"),
          options: [
            {
              value: "loopback",
              label: t("wizard.gateway.bindLoopback"),
              hint: t("wizard.gateway.bindLoopbackHint"),
            },
            {
              value: "lan",
              label: t("wizard.gateway.bindLan"),
              hint: t("wizard.gateway.bindLanHint"),
            },
            {
              value: "tailnet",
              label: t("wizard.gateway.bindTailnet"),
              hint: t("wizard.gateway.bindTailnetHint"),
            },
            {
              value: "auto",
              label: t("wizard.gateway.bindAuto"),
              hint: t("wizard.gateway.bindAutoHint"),
            },
            {
              value: "custom",
              label: t("wizard.gateway.bindCustom"),
              hint: t("wizard.gateway.bindCustomHint"),
            },
          ],
          initialValue: defaultBind,
        });

  let customBindHost = baseConfig.customBindHost;
  if (bind === "custom") {
    const needsPrompt = flow !== "quickstart" || !customBindHost;
    if (needsPrompt) {
      const input = await prompter.text({
        message: t("wizard.gateway.bindCustomIp"),
        placeholder: "192.168.1.100",
        initialValue: customBindHost ?? "",
        validate: validateIPv4AddressInput,
      });
      customBindHost = typeof input === "string" ? input.trim() : undefined;
    }
  }

  let authMode: GatewayAuthMode =
    flow === "quickstart"
      ? defaultAuthMode
      : await prompter.select<GatewayAuthMode>({
          message: t("wizard.gateway.accessProtection"),
          options: [
            {
              value: "token",
              label: t("common.tokenRecommended"),
              hint: t("wizard.gateway.plaintextTokenHint"),
            },
            { value: "password", label: t("common.password") },
            { value: "none", label: t("common.noAuth") },
          ],
          initialValue: defaultAuthMode,
        });

  const tailscaleMode: GatewayTailscaleMode =
    flow === "quickstart"
      ? defaultTailscaleMode
      : await prompter.select<GatewayTailscaleMode>({
          message: t("wizard.gateway.tailscaleExposure"),
          options: [
            {
              value: "off",
              label: t("wizard.gatewayTailscale.off"),
              hint: t("wizard.gatewayTailscale.offHint"),
            },
            {
              value: "serve",
              label: t("wizard.gatewayTailscale.serve"),
              hint: t("wizard.gatewayTailscale.serveHint"),
            },
            {
              value: "funnel",
              label: t("wizard.gatewayTailscale.funnel"),
              hint: t("wizard.gatewayTailscale.funnelHint"),
            },
          ],
          initialValue: defaultTailscaleMode,
        });

  let tailscaleResetOnExit = flow === "quickstart" ? (baseConfig.tailscaleResetOnExit ?? false) : false;
  if (tailscaleMode !== "off" && flow !== "quickstart") {
    await prompter.note(t("wizard.gatewayTailscale.docsNote"), "Tailscale");
    tailscaleResetOnExit = await prompter.confirm({
      message: t("wizard.gateway.tailscaleReset"),
      initialValue: false,
    });
  }

  if (tailscaleMode !== "off" && bind !== "loopback") {
    await prompter.note(
      t("wizard.gatewayNotes.tailscaleBindLoopback"),
      t("wizard.gatewayNotes.bindTitle"),
    );
    bind = "loopback";
    customBindHost = undefined;
  }

  if (tailscaleMode === "funnel" && authMode !== "password") {
    await prompter.note(
      t("wizard.gatewayNotes.tailscaleFunnelPassword"),
      t("wizard.gateway.auth"),
    );
    authMode = "password";
  }

  let token: string | undefined;
  if (authMode === "token") {
    const tokenMode =
      flow === "quickstart" && opts.secretInputMode !== "ref"
        ? "plaintext"
        : opts.secretInputMode ?? "plaintext";

    if (tokenMode === "ref") {
      const refValue = baseConfig.token;
      if (refValue) {
        try {
          token = await resolveSetupSecretInputString({
            value: refValue,
            path: "gateway.auth.token",
            env: process.env,
          });
        } catch (error) {
          logger.debug(`[Wizard:GatewayConfig] SecretRef resolution failed: ${error}`);
        }
      }
      if (!token) {
        const input = await prompter.text({
          message: t("wizard.gateway.tokenPromptGenerate"),
          placeholder: t("wizard.gateway.tokenPlaceholder"),
          sensitive: true,
        });
        token = input.trim() || generateRandomToken();
      }
    } else if (flow === "quickstart") {
      token = baseConfig.token ?? generateRandomToken();
    } else {
      const existingToken = baseConfig.token;
      let tokenInput: string | undefined;
      if (existingToken) {
        const keep = await prompter.confirm({
          message: t("wizard.gateway.existingTokenConfirm", {
            token: maskApiKey(existingToken),
          }),
          initialValue: true,
        });
        tokenInput = keep
          ? existingToken
          : await prompter.text({
              message: t("wizard.gateway.tokenPromptGenerate"),
              placeholder: t("wizard.gateway.tokenPlaceholder"),
              sensitive: true,
            });
      } else {
        tokenInput = await prompter.text({
          message: t("wizard.gateway.tokenPromptGenerate"),
          placeholder: t("wizard.gateway.tokenPlaceholder"),
          sensitive: true,
        });
      }
      token = tokenInput.trim() || generateRandomToken();
    }
  }

  let password: string | undefined;
  if (authMode === "password") {
    if (flow === "quickstart" && baseConfig.password) {
      password = baseConfig.password;
    } else {
      const existingPassword = baseConfig.password;
      if (existingPassword && flow !== "quickstart") {
        const keep = await prompter.confirm({
          message: t("wizard.gateway.existingPasswordConfirm", {
            password: maskApiKey(existingPassword),
          }),
          initialValue: true,
        });
        if (keep) {
          password = existingPassword;
        }
      }
      if (!password) {
        password = normalizeWizardTextInput(
          await prompter.text({
            message: t("wizard.gateway.passwordPrompt"),
            validate: validateGatewayPasswordInput,
            sensitive: true,
          }),
        );
      }
    }
  }

  const config: GatewayConfig = {
    port,
    bind,
    ...(bind === "custom" && customBindHost ? { customBindHost } : {}),
    authMode,
    ...(token ? { token } : {}),
    ...(password ? { password } : {}),
    tailscaleMode,
    tailscaleResetOnExit,
  };

  logger.debug(`[Wizard:GatewayConfig] Config complete (bind=${bind}, authMode=${authMode}, port=${port})`);

  return { config };
}
