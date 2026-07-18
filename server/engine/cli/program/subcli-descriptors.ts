// Sub-CLI descriptor catalog，用于根 help 占位符与 lazy registration。
// 移植自 openclaw/src/cli/program/subcli-descriptors.ts。
//
// 降级策略：
//  - 原模块依赖 `./private-qa-cli.js` 中的 `isPrivateQaCliEnabled` 进行 qa 命令的私有门控；
//    cross-wms 未移植 `private-qa-cli.js`（依赖 `infra/openclaw-root.js`），此处直接返回
//    `false` 等价行为：始终过滤掉 `qa` 命令。
//  - 完整的 lazy 注册流程由 cross-wms 自有的命令注册路径处理。

import { defineCommandDescriptorCatalog } from "./command-descriptor-utils.js";
import type { NamedCommandDescriptor } from "./command-group-descriptors.js";

/** 根级 sub-CLI 命令 descriptor 形状。 */
export type SubCliDescriptor = NamedCommandDescriptor;

const subCliCommandCatalog = defineCommandDescriptorCatalog([
  { name: "acp", description: "Run and manage ACP-backed coding agents", hasSubcommands: true },
  {
    name: "gateway",
    description: "Run, inspect, and query the OpenClaw Gateway",
    hasSubcommands: true,
  },
  {
    name: "daemon",
    description: "Manage the Gateway service (legacy alias)",
    hasSubcommands: true,
  },
  { name: "logs", description: "Tail Gateway logs locally or via RPC", hasSubcommands: false },
  {
    name: "system",
    description: "System events, heartbeat, and presence",
    hasSubcommands: true,
  },
  {
    name: "models",
    description: "List, scan, and set model providers",
    hasSubcommands: true,
  },
  {
    name: "infer",
    description: "Run provider-backed model, media, search, and embedding commands",
    hasSubcommands: true,
  },
  {
    name: "capability",
    description: "Run provider capability commands (fallback alias: infer)",
    hasSubcommands: true,
  },
  {
    name: "approvals",
    description: "Manage exec approvals (gateway or node host)",
    hasSubcommands: true,
    parentDefaultHelp: true,
  },
  {
    name: "exec-policy",
    description: "Show or synchronize requested exec policy with host approvals",
    hasSubcommands: true,
  },
  {
    name: "nodes",
    description: "Pair nodes and run node-host commands through the Gateway",
    hasSubcommands: true,
  },
  {
    name: "devices",
    description: "Device pairing + token management",
    hasSubcommands: true,
    parentDefaultHelp: true,
  },
  {
    name: "node",
    description: "Run and manage the headless node host service",
    hasSubcommands: true,
  },
  {
    name: "sandbox",
    description: "Manage sandbox containers for agent isolation",
    hasSubcommands: true,
  },
  {
    name: "tui",
    description: "Open a terminal UI connected to the Gateway",
    hasSubcommands: false,
  },
  {
    name: "terminal",
    description: "Open a local terminal UI (alias for tui --local)",
    hasSubcommands: false,
  },
  {
    name: "chat",
    description: "Open a local terminal UI (alias for tui --local)",
    hasSubcommands: false,
  },
  {
    name: "cron",
    description: "Schedule and inspect Gateway background jobs",
    hasSubcommands: true,
    parentDefaultHelp: true,
  },
  {
    name: "dns",
    description: "DNS helpers for wide-area discovery (Tailscale + CoreDNS)",
    hasSubcommands: true,
  },
  {
    name: "docs",
    description: "Search the live OpenClaw docs",
    hasSubcommands: false,
  },
  // `qa` 命令在原 openclaw 中通过 `isPrivateQaCliEnabled` 门控，cross-wms 未移植该门控。
  // 此处省略 `qa` 描述符以匹配 openclaw 在私有门控关闭时的行为。
  {
    name: "proxy",
    description: "Run the OpenClaw debug proxy and inspect captured traffic",
    hasSubcommands: true,
  },
  {
    name: "hooks",
    description: "Manage internal agent hooks",
    hasSubcommands: true,
  },
  {
    name: "webhooks",
    description: "Webhook helpers and integrations",
    hasSubcommands: true,
  },
  {
    name: "qr",
    description: "Generate mobile pairing QR/setup code",
    hasSubcommands: false,
  },
  {
    name: "clawbot",
    description: "Legacy clawbot command aliases",
    hasSubcommands: true,
  },
  {
    name: "pairing",
    description: "Secure DM pairing (approve inbound requests)",
    hasSubcommands: true,
  },
  {
    name: "plugins",
    description: "Install, enable, disable, and inspect plugins",
    hasSubcommands: true,
    parentDefaultHelp: true,
  },
  {
    name: "channels",
    description: "Add, remove, login, and inspect messaging channels",
    hasSubcommands: true,
    parentDefaultHelp: true,
  },
  {
    name: "directory",
    description: "Lookup contact and group IDs (self, peers, groups) for supported chat channels",
    hasSubcommands: true,
  },
  {
    name: "security",
    description: "Security tools and local config audits",
    hasSubcommands: true,
  },
  {
    name: "secrets",
    description: "Audit, apply, and reload SecretRef-backed credentials",
    hasSubcommands: true,
  },
  {
    name: "skills",
    description: "List, inspect, and install agent skills",
    hasSubcommands: true,
  },
  {
    name: "update",
    description: "Update OpenClaw and inspect update channel status",
    hasSubcommands: true,
  },
  {
    name: "completion",
    description: "Generate shell completion script",
    hasSubcommands: false,
  },
] as const satisfies ReadonlyArray<SubCliDescriptor>);

function filterPrivateQaItems<T>(
  items: ReadonlyArray<T>,
  getName: (item: T) => string,
): ReadonlyArray<T> {
  // 降级实现：cross-wms 未移植 private-qa-cli 门控；这里始终过滤掉 `qa` 命令，
  // 与 openclaw 在 `isPrivateQaCliEnabled()` 返回 false 时的行为一致。
  return items.filter((item) => getName(item) !== "qa");
}

/** 经过私有 QA 门控后可见的 sub-CLI descriptor。 */
export const SUB_CLI_DESCRIPTORS = filterPrivateQaItems(
  subCliCommandCatalog.descriptors,
  (descriptor) => descriptor.name,
);

/** 返回可见的 sub-CLI descriptor（按 help/registration 顺序）。 */
export function getSubCliEntries(): ReadonlyArray<SubCliDescriptor> {
  return filterPrivateQaItems(
    subCliCommandCatalog.getDescriptors(),
    (descriptor) => descriptor.name,
  );
}

/** 返回可见的 sub-CLI 中拥有子命令的 name。 */
export function getSubCliCommandsWithSubcommands(): string[] {
  return [
    ...filterPrivateQaItems(
      subCliCommandCatalog.getCommandsWithSubcommands(),
      (command) => command,
    ),
  ];
}

/** 返回可见的 sub-CLI 中其父命令应默认显示 help 的 name。 */
export function getSubCliParentDefaultHelpCommands(): string[] {
  return [
    ...filterPrivateQaItems(
      subCliCommandCatalog.getParentDefaultHelpCommands(),
      (command) => command,
    ),
  ];
}
