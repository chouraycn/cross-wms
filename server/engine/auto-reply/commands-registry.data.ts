/** Built-in and channel-derived command registry data for auto-reply commands. */
import { listLoadedChannelPlugins } from "../channels/registry-loaded.js";
import { getActivePluginChannelRegistryVersionFromState } from "../plugins/runtime-channel-state.js";
import type {
  ChatCommandDefinition,
  CommandArgsParsing,
  CommandScope,
  CommandCategory,
  CommandTier,
} from "./commands-registry.types.js";
import type { ThinkLevel, ThinkingCatalogEntry } from "./thinking.shared.js";
import { listThinkingLevels } from "../thinkingMode.js";

// commands-registry.shared.ts (1011 lines) is intentionally not ported to
// cross-wms yet. The three helpers below are minimal local stubs that preserve
// the public surface used by commands-registry.data.ts so this module compiles
// and remains wired into the auto-reply barrel. Behaviour is degraded: builtin
// command list is empty and defineChatCommand returns the input as-is.

type ListThinkingLevels = (
  provider?: string | null,
  model?: string | null,
  catalog?: ThinkingCatalogEntry[],
) => ThinkLevel[];

type DefineChatCommandInput = {
  key: string;
  nativeName?: string;
  nativeAliases?: string[];
  description: string;
  args?: ChatCommandDefinition["args"];
  argsParsing?: CommandArgsParsing;
  formatArgs?: ChatCommandDefinition["formatArgs"];
  argsMenu?: ChatCommandDefinition["argsMenu"];
  acceptsArgs?: boolean;
  textAlias?: string;
  textAliases?: string[];
  scope?: CommandScope;
  category?: CommandCategory;
  tier?: CommandTier;
};

function defineChatCommand(command: DefineChatCommandInput): ChatCommandDefinition {
  const aliases = (command.textAliases ?? (command.textAlias ? [command.textAlias] : []))
    .map((alias) => alias.trim())
    .filter(Boolean);
  const scope =
    command.scope ?? (command.nativeName ? (aliases.length ? "both" : "native") : "text");
  const acceptsArgs = command.acceptsArgs ?? Boolean(command.args?.length);
  const argsParsing: CommandArgsParsing =
    command.argsParsing ?? (command.args?.length ? "positional" : "none");
  return {
    key: command.key,
    nativeName: command.nativeName,
    nativeAliases: command.nativeAliases,
    description: command.description,
    acceptsArgs,
    args: command.args,
    argsParsing,
    formatArgs: command.formatArgs,
    argsMenu: command.argsMenu,
    textAliases: aliases,
    scope,
    category: command.category,
    tier: command.tier,
  };
}

function buildBuiltinChatCommands(_params: {
  listThinkingLevels?: ListThinkingLevels;
} = {}): ChatCommandDefinition[] {
  // cross-wms stub: builtin command set is not ported from
  // commands-registry.shared.ts. Returns empty until that module is migrated.
  return [];
}

function assertCommandRegistry(_commands: ChatCommandDefinition[]): void {
  // cross-wms stub: validation logic from commands-registry.shared.ts is not
  // ported. No-op here so buildChatCommands stays forward-compatible.
}

/** Builds and caches the chat-command registry for the current channel-plugin registry version. */
type ChannelPlugin = {
  id: string;
  capabilities?: any;
};

function asChannelPlugin(plugin: any): ChannelPlugin {
  return plugin as ChannelPlugin;
}

function supportsNativeCommands(plugin: any): boolean {
  const capabilities = asChannelPlugin(plugin).capabilities as
    | { nativeCommands?: boolean }
    | undefined;
  return capabilities?.nativeCommands === true;
}

function defineDockCommand(plugin: ChannelPlugin): ChatCommandDefinition {
  return defineChatCommand({
    key: `dock:${plugin.id}`,
    nativeName: `dock_${plugin.id}`,
    description: `Switch to ${plugin.id} for replies.`,
    textAliases: [`/dock-${plugin.id}`, `/dock_${plugin.id}`],
    category: "docks",
  });
}

let cachedCommands: ChatCommandDefinition[] | null = null;
let cachedRegistryVersion = -1;

function buildChatCommands(): ChatCommandDefinition[] {
  // cross-wms listLoadedChannelPlugins stub returns unknown; cast to the
  // minimal channel-plugin array shape used by the dock builder below.
  const loadedPlugins = (listLoadedChannelPlugins() as ChannelPlugin[]) ?? [];
  const commands: ChatCommandDefinition[] = [
    ...buildBuiltinChatCommands({ listThinkingLevels }),
    ...loadedPlugins
      .filter(supportsNativeCommands)
      .map((plugin) => defineDockCommand(plugin)),
  ];

  assertCommandRegistry(commands);
  return commands;
}

/** Returns the current command registry, including dynamic dock commands for native surfaces. */
export function getChatCommands(): ChatCommandDefinition[] {
  const registryVersion = getActivePluginChannelRegistryVersionFromState();
  if (cachedCommands && registryVersion === cachedRegistryVersion) {
    return cachedCommands;
  }
  const commands = buildChatCommands();
  cachedCommands = commands;
  cachedRegistryVersion = registryVersion;
  return commands;
}
