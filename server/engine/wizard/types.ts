export type WizardFlow = "quickstart" | "advanced";

export type GatewayAuthMode = "token" | "password" | "none";

export type GatewayBindMode = "loopback" | "lan" | "auto" | "custom" | "tailnet";

export type GatewayTailscaleMode = "off" | "serve" | "funnel";

export interface SetupConfig {
  flow: WizardFlow;
  gateway: GatewayConfig;
  plugins: PluginConfig[];
  secrets: Record<string, string>;
  migration?: MigrationConfig;
}

export interface GatewayConfig {
  port: number;
  bind: GatewayBindMode;
  customBindHost?: string;
  authMode: GatewayAuthMode;
  token?: string;
  password?: string;
  tailscaleMode: GatewayTailscaleMode;
  tailscaleResetOnExit: boolean;
}

export interface PluginConfig {
  id: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface MigrationConfig {
  source: string;
  sourcePath: string;
  includeSecrets: boolean;
}

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  order: number;
  skipable?: boolean;
}

export interface WizardState {
  currentStepIndex: number;
  steps: WizardStep[];
  config: Partial<SetupConfig>;
  completed: boolean;
  cancelled: boolean;
  errors: string[];
}

export interface WizardProgress {
  current: number;
  total: number;
  percentage: number;
}

export type SecretInputMode = "plaintext" | "ref";
