// 重新导出 types/openclaw.ts 的完整类型定义
// 避免两个不同路径的 OpenClawConfig 类型冲突
export * from './types/openclaw.js';

// 显式 import type 以在编译期触发对 gateway/access-groups 类型文件的依赖校验，
// 确保类型层级的"补全"在重构中保持显式声明。
// 这里使用 `import type` 不产生运行时副作用，也不与 export * 产生命名冲突。
import type {
  DiscoveryConfig as _ImportedDiscoveryConfig,
  GatewayConfig as _ImportedGatewayConfig,
  TalkConfig as _ImportedTalkConfig,
} from './types/gateway.js';
import type {
  AccessGroupConfig as _ImportedAccessGroupConfig,
  AccessGroupsConfig as _ImportedAccessGroupsConfig,
} from './types/access-groups.js';

// 引用别名以保持 TypeScript 对这些类型文件的强依赖关系，
// 避免在重构时静默丢失对 gateway/access-groups 配置层的引用。
// 编译时通过 _*Tuple 间接使用别名，不会引入运行时副作用。
type _ImportedGatewayTypeTuple = [
  _ImportedDiscoveryConfig,
  _ImportedGatewayConfig,
  _ImportedTalkConfig,
];
type _ImportedAccessGroupTypeTuple = [
  _ImportedAccessGroupConfig,
  _ImportedAccessGroupsConfig,
];
export type {
  _ImportedGatewayTypeTuple,
  _ImportedAccessGroupTypeTuple,
};
