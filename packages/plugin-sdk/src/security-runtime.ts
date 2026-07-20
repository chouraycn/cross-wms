/**
 * @deprecated Broad public SDK barrel. Prefer focused security/SSRF/secret
 * subpaths and avoid adding new imports here.
 */

/** Result of safely opening a file within a trusted root. */
type OpenResult = unknown;

// TODO: 依赖模块未移植，暂用本地桩
async function fsRoot(_rootDir: string): Promise<{
  open(
    _relativePath: string,
    _options?: {
      hardlinks?: "allow" | "reject";
      nonBlockingRead?: boolean;
      symlinks?: "follow-within-root" | "reject";
    },
  ): Promise<OpenResult>;
  copyIn(
    _relativePath: string,
    _sourcePath: string,
    _options?: { mkdir?: boolean; sourceHardlinks?: "allow" | "reject" },
  ): Promise<void>;
}> {
  throw new Error("fsRoot: not implemented (dependency not ported)");
}

/** Safely open a path beneath a trusted root while rejecting hardlinks and unsafe symlinks by default. */
export async function openFileWithinRoot(params: {
  rootDir: string;
  relativePath: string;
  rejectHardlinks?: boolean;
  nonBlockingRead?: boolean;
  allowSymlinkTargetWithinRoot?: boolean;
}): Promise<OpenResult> {
  const root = await fsRoot(params.rootDir);
  return await root.open(params.relativePath, {
    hardlinks: params.rejectHardlinks === false ? "allow" : "reject",
    nonBlockingRead: params.nonBlockingRead,
    symlinks: params.allowSymlinkTargetWithinRoot === true ? "follow-within-root" : "reject",
  });
}

/** Copy a source file into a path beneath a trusted root using fs-safe root policy. */
export async function writeFileFromPathWithinRoot(params: {
  rootDir: string;
  relativePath: string;
  sourcePath: string;
  mkdir?: boolean;
}): Promise<void> {
  const root = await fsRoot(params.rootDir);
  await root.copyIn(params.relativePath, params.sourcePath, {
    mkdir: params.mkdir,
    sourceHardlinks: "reject",
  });
}
