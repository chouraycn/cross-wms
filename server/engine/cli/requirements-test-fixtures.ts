// 共享的空 requirement / install-check 测试夹具，供 CLI 测试使用。

function createEmptyRequirements() {
  return {
    bins: [],
    anyBins: [],
    env: [],
    config: [],
    os: [],
  };
}

/**
 * 构造一个空的 install-check 结果，包含全部 requirement 桶。
 */
export function createEmptyInstallChecks() {
  return {
    requirements: createEmptyRequirements(),
    missing: createEmptyRequirements(),
    configChecks: [],
    install: [],
  };
}
