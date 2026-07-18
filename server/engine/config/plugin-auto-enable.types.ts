// 移植自 openclaw/src/config/plugin-auto-enable.types.ts
// 定义插件自动启用决策与候选类型。
import type { OpenClawConfig } from "./types/openclaw.js";

/** Reasons a configured surface can cause a plugin to be auto-enabled. */
export type PluginAutoEnableCandidate =
  | {
      pluginId: string;
      kind: "channel-configured";
      channelId: string;
    }
  | {
      pluginId: string;
      kind: "provider-auth-configured";
      providerId: string;
    }
  | {
      pluginId: string;
      kind: "provider-model-configured";
      modelRef: string;
    }
  | {
      pluginId: string;
      kind: "speech-provider-selected";
      providerId: string;
    }
  | {
      pluginId: string;
      kind: "agent-harness-runtime-configured";
      runtime: string;
    }
  | {
      pluginId: string;
      kind: "web-search-provider-selected";
      providerId: string;
    }
  | {
      pluginId: string;
      kind: "web-fetch-provider-selected";
      providerId: string;
    }
  | {
      pluginId: string;
      kind: "plugin-web-search-configured";
    }
  | {
      pluginId: string;
      kind: "plugin-web-fetch-configured";
    }
  | {
      pluginId: string;
      kind: "plugin-tool-configured";
    }
  | {
      pluginId: string;
      kind: "configured-plugin-repaired";
    }
  | {
      pluginId: string;
      kind: "setup-auto-enable";
      reason: string;
    };

export type PluginAutoEnableResult = {
  config: OpenClawConfig;
  changes: string[];
  autoEnabledReasons: Record<string, string[]>;
};
