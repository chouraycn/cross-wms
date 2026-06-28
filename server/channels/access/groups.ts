/**
 * Access group management.
 *
 * Manages static and dynamic access groups used in allowlist matching
 * and authorization decisions.
 */
import type {
  AccessGroup,
  AccessGroupResolutionContext,
  ChannelIngressIdentifier,
} from "./types.js";

/**
 * Access group manager for creating, retrieving, and resolving access groups.
 */
export class AccessGroupManager {
  private groups: Map<string, AccessGroup> = new Map();

  /**
   * Adds a new access group.
   * @param group - The access group to add
   */
  addGroup(group: AccessGroup): void {
    this.groups.set(group.id, group);
  }

  /**
   * Retrieves an access group by its ID.
   * @param id - The access group ID
   * @returns The access group or null if not found
   */
  getGroup(id: string): AccessGroup | null {
    return this.groups.get(id) ?? null;
  }

  /**
   * Gets all registered access groups.
   * @returns Array of all access groups
   */
  listAll(): AccessGroup[] {
    return Array.from(this.groups.values());
  }

  /**
   * Checks if an identifier matches any member in an access group.
   * @param group - The access group to check
   * @param identifier - The identifier to match
   * @returns True if the identifier matches any member in the group
   */
  private identifierMatches(
    group: AccessGroup,
    identifier: ChannelIngressIdentifier,
  ): boolean {
    return group.members.some(
      (member) =>
        member.kind === identifier.kind && member.value === identifier.value,
    );
  }

  /**
   * Resolves a dynamic access group for a given context.
   * Subclasses or extensions can override this method to implement
   * dynamic membership resolution (e.g., from external identity providers).
   * @param id - The access group ID to resolve
   * @param context - The resolution context
   * @returns The resolved access group with populated members, or null if not found
   */
  async resolveDynamicGroup(
    id: string,
    context: AccessGroupResolutionContext,
  ): Promise<AccessGroup | null> {
    const group = this.groups.get(id);
    if (!group) {
      return null;
    }

    // For static groups, return as-is
    if (!group.dynamic) {
      return group;
    }

    // For dynamic groups, return the group with its current members
    // Dynamic resolution is handled by extensions that override this method
    return group;
  }

  /**
   * Checks if a sender identifier is a member of a specific access group.
   * @param groupId - The access group ID
   * @param identifier - The sender identifier to check
   * @param context - Optional resolution context for dynamic groups
   * @returns True if the identifier is a member of the group
   */
  async isMember(
    groupId: string,
    identifier: ChannelIngressIdentifier,
    context?: AccessGroupResolutionContext,
  ): Promise<boolean> {
    const group = context
      ? await this.resolveDynamicGroup(groupId, context)
      : this.getGroup(groupId);

    if (!group) {
      return false;
    }

    return this.identifierMatches(group, identifier);
  }

  /**
   * Loads access groups from a configuration object.
   * @param config - Record of access group configurations
   */
  loadFromConfig(
    config: Record<string, { members?: string[]; dynamic?: boolean }>,
  ): void {
    for (const [id, cfg] of Object.entries(config)) {
      const members: ChannelIngressIdentifier[] = [];

      if (cfg.members) {
        for (const member of cfg.members) {
          // Parse member string format: "kind:value" or just "value" (defaults to stable-id)
          const colonIndex = member.indexOf(":");
          if (colonIndex > 0) {
            const kind = member.slice(0, colonIndex) as ChannelIngressIdentifier["kind"];
            const value = member.slice(colonIndex + 1);
            members.push({ kind, value });
          } else {
            members.push({ kind: "stable-id", value: member });
          }
        }
      }

      this.addGroup({
        id,
        name: id,
        members,
        dynamic: cfg.dynamic,
      });
    }
  }

  /**
   * Removes an access group by its ID.
   * @param id - The access group ID to remove
   * @returns True if the group was removed
   */
  removeGroup(id: string): boolean {
    return this.groups.delete(id);
  }

  /**
   * Clears all access groups.
   */
  clear(): void {
    this.groups.clear();
  }
}
