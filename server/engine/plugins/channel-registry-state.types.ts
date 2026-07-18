/** 暴露活跃插件通道注册所需的运行时形状。 */
export type ActiveChannelPluginRuntimeShape = {
  id?: string | null;
  meta?: {
    aliases?: readonly string[];
    markdownCapable?: boolean;
    order?: number;
  } | null;
  messaging?: {
    targetPrefixes?: readonly string[];
  } | null;
  capabilities?: {
    nativeCommands?: boolean;
  } | null;
  conversationBindings?: {
    supportsCurrentConversationBinding?: boolean;
  } | null;
};

/** 带归属插件元数据的活跃通道注册。 */
export type ActivePluginChannelRegistration = {
  plugin: ActiveChannelPluginRuntimeShape;
  pluginId?: string | null;
  origin?: string | null;
};

/** 活跃运行时通道注册表快照。 */
export type ActivePluginChannelRegistry = {
  channels: ActivePluginChannelRegistration[];
};
