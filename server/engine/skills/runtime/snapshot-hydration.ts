export interface SnapshotWithRuntimeSkills {
  resolvedSkills?: unknown;
}

export interface SnapshotRebuild<T extends SnapshotWithRuntimeSkills> {
  resolvedSkills?: T["resolvedSkills"];
}

export function hydrateResolvedSkills<T extends SnapshotWithRuntimeSkills>(
  snapshot: T,
  rebuild: () => SnapshotRebuild<T>,
): T {
  if (snapshot.resolvedSkills !== undefined) {
    return snapshot;
  }
  return { ...snapshot, resolvedSkills: rebuild().resolvedSkills };
}