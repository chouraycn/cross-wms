/**
 * Allowlist management.
 *
 * Manages DM and group allowlists for validating sender access.
 */
import type { AppConfig, ChannelId } from "../types.js";
import type { ChannelIngressIdentifier } from "./types.js";
import type { Allowlist } from "./types.js";

/**
 * Allowlist manager for checking, adding, and removing allowed identifiers.
 */
export class AllowlistManager {
  private allowlist: Allowlist = {
    dm: [],
    group: [],
  };

  /**
   * Checks if an identifier is in the allowlist for the specified type.
   * @param identifier - The identifier to check
   * @param type - The allowlist type ("dm" or "group")
   * @returns True if the identifier is in the allowlist
   */
  isAllowed(identifier: ChannelIngressIdentifier, type: "dm" | "group"): boolean {
    const list = this.allowlist[type];
    return list.some(
      (entry) => entry.kind === identifier.kind && entry.value === identifier.value,
    );
  }

  /**
   * Checks if any of the given identifiers are in the allowlist.
   * @param identifiers - The identifiers to check
   * @param type - The allowlist type ("dm" or "group")
   * @returns True if any identifier is in the allowlist
   */
  isAnyAllowed(identifiers: ChannelIngressIdentifier[], type: "dm" | "group"): boolean {
    return identifiers.some((id) => this.isAllowed(id, type));
  }

  /**
   * Adds an identifier to the allowlist.
   * @param identifier - The identifier to add
   * @param type - The allowlist type ("dm" or "group")
   */
  add(identifier: ChannelIngressIdentifier, type: "dm" | "group"): void {
    const list = this.allowlist[type];
    // Avoid duplicates
    if (!this.isAllowed(identifier, type)) {
      list.push({ ...identifier });
    }
  }

  /**
   * Removes an identifier from the allowlist.
   * @param identifier - The identifier to remove
   * @param type - The allowlist type ("dm" or "group")
   */
  remove(identifier: ChannelIngressIdentifier, type: "dm" | "group"): void {
    const list = this.allowlist[type];
    const index = list.findIndex(
      (entry) => entry.kind === identifier.kind && entry.value === identifier.value,
    );
    if (index >= 0) {
      list.splice(index, 1);
    }
  }

  /**
   * Loads allowlist entries from app configuration.
   * @param config - The app configuration
   * @param channelId - The channel ID to load allowlists for
   */
  loadFromConfig(config: AppConfig, channelId: ChannelId): void {
    // Reset allowlists
    this.allowlist = { dm: [], group: [] };

    // Load DM allowlist from config
    // Config format expected: { channels: { [channelId]: { allowlist: { dm: [...], group: [...] } } } }
    const channelConfig = (config.channels as Record<string, any> | undefined)?.[channelId];
    if (channelConfig?.allowlist) {
      const allowlistConfig = channelConfig.allowlist;

      if (Array.isArray(allowlistConfig.dm)) {
        for (const entry of allowlistConfig.dm) {
          this.parseAndAddEntry(entry, "dm");
        }
      }

      if (Array.isArray(allowlistConfig.group)) {
        for (const entry of allowlistConfig.group) {
          this.parseAndAddEntry(entry, "group");
        }
      }
    }
  }

  /**
   * Parses an allowlist entry and adds it to the appropriate list.
   * Entry formats:
   * - "kind:value" (e.g., "username:john", "email:john@example.com")
   * - "value" (defaults to stable-id)
   * @param entry - The entry to parse
   * @param type - The allowlist type
   */
  private parseAndAddEntry(entry: string | ChannelIngressIdentifier, type: "dm" | "group"): void {
    if (typeof entry === "string") {
      const colonIndex = entry.indexOf(":");
      if (colonIndex > 0) {
        const kind = entry.slice(0, colonIndex) as ChannelIngressIdentifier["kind"];
        const value = entry.slice(colonIndex + 1);
        this.add({ kind, value }, type);
      } else {
        this.add({ kind: "stable-id", value: entry }, type);
      }
    } else if (entry && typeof entry === "object" && "kind" in entry && "value" in entry) {
      this.add(entry, type);
    }
  }

  /**
   * Gets the current allowlist.
   * @returns The current allowlist
   */
  getAllowlist(): Readonly<Allowlist> {
    return this.allowlist;
  }

  /**
   * Clears all allowlist entries.
   */
  clear(): void {
    this.allowlist = { dm: [], group: [] };
  }

  /**
   * Gets all identifiers in the allowlist for a specific type.
   * @param type - The allowlist type
   * @returns Array of identifiers in the allowlist
   */
  getEntries(type: "dm" | "group"): ChannelIngressIdentifier[] {
    return [...this.allowlist[type]];
  }
}
