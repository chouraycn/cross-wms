import type { Command } from "commander";
import { logger } from "../../logger.js";
import { pluginRuntimeRegistry } from "../../engine/plugins/registry.js";
import {
  type StatusPluginHealthSnapshot,
  type PluginHealthRecord,
  formatCompactPluginHealthLine,
  formatDetailedPluginHealth,
} from "../../engine/status/index.js";

export type HealthOptions = {
  json?: boolean;
  verbose?: boolean;
};

interface HealthSummary {
  ok: boolean;
  ts: number;
  uptime: number;
  memory: {
    used: number;
    total: number;
    external: number;
  };
  plugins: {
    loaded: number;
    errors: number;
    disabled: number;
  };
  sessions: number;
  bindings: number;
}

function collectPluginHealthSnapshot(): StatusPluginHealthSnapshot {
  const entries = pluginRuntimeRegistry.list();
  const plugins: PluginHealthRecord[] = entries.map((entry) => ({
    id: entry.pluginId,
    status: entry.status === "enabled" ? "loaded" : entry.status === "error" ? "error" : "disabled",
    error: entry.status === "error" ? "Plugin load error" : undefined,
  }));

  return {
    plugins,
    diagnostics: [],
    contextEngineQuarantines: [],
  };
}

function getHealthSnapshot(): HealthSummary {
  const mem = process.memoryUsage();
  const pluginSnapshot = collectPluginHealthSnapshot();

  const loaded = pluginSnapshot.plugins.filter((p) => p.status === "loaded").length;
  const errors = pluginSnapshot.plugins.filter((p) => p.status === "error").length;
  const disabled = pluginSnapshot.plugins.filter((p) => p.status === "disabled").length;

  return {
    ok: errors === 0,
    ts: Date.now(),
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(mem.rss / 1024 / 1024),
      total: Math.round(mem.heapTotal / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
    },
    plugins: {
      loaded,
      errors,
      disabled,
    },
    sessions: 0,
    bindings: 0,
  };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}

function formatHealthText(summary: HealthSummary, verbose: boolean): string {
  const lines: string[] = [];

  lines.push(`Gateway health: ${summary.ok ? "✅ OK" : "⚠️ Issues detected"}`);
  lines.push(`Uptime: ${formatUptime(summary.uptime)}`);
  lines.push(`Memory: ${summary.memory.used} MB / ${summary.memory.total} MB (external: ${summary.memory.external} MB)`);
  lines.push("");

  const pluginSnapshot = collectPluginHealthSnapshot();
  if (verbose) {
    lines.push(formatDetailedPluginHealth(pluginSnapshot));
  } else {
    lines.push(formatCompactPluginHealthLine(pluginSnapshot));
  }

  lines.push("");
  lines.push(`Sessions: ${summary.sessions}`);
  lines.push(`Bindings: ${summary.bindings}`);

  return lines.join("\n");
}

export async function healthCommand(options: HealthOptions): Promise<void> {
  const summary = getHealthSnapshot();

  if (options.json) {
    logger.info(JSON.stringify(summary, null, 2));
  } else {
    logger.info(formatHealthText(summary, options.verbose ?? false));
  }
}

export function registerHealthCommand(program: Command): void {
  program
    .command("health")
    .description("检查系统健康状态")
    .option("--json", "JSON 输出格式")
    .option("-v, --verbose", "显示详细信息")
    .action(async (options: HealthOptions) => {
      await healthCommand(options);
    });
}