// 通过 fs-safe 默认值暴露路径别名越界守卫。
// 降级实现：openclaw 中从 @openclaw/fs-safe/advanced 导入，
// cross-wms 在 _fs-safe-stubs 中提供真实实现。
import "./fs-safe-defaults.js";
import {
  PATH_ALIAS_POLICIES,
  assertNoPathAliasEscape,
  type PathAliasPolicy,
} from "./_fs-safe-stubs.js";

// 别名守卫拒绝看起来本地但越出预期根目录的路径形式。
export {
  PATH_ALIAS_POLICIES,
  assertNoPathAliasEscape,
  type PathAliasPolicy,
};
