/**
 * catalog.ts 单元测试
 *
 * 覆盖 buildChannelUiCatalog 的映射/裁剪逻辑，以及当前降级实现下
 * list 与 get 系列目录查询函数返回空结果的契约。
 */
import { describe, it, expect } from "vitest";
import {
  buildChannelUiCatalog,
  listRawChannelPluginCatalogEntries,
  listChannelPluginCatalogEntries,
  getChannelPluginCatalogEntry,
} from "../catalog.js";
import type { ChannelPluginCatalogEntry } from "../catalog.js";

describe("channels/catalog", () => {
  describe("buildChannelUiCatalog", () => {
    it("returns an empty catalog when no entries are provided", () => {
      expect(buildChannelUiCatalog()).toEqual({ entries: [] });
    });

    it("returns an empty catalog for an empty array", () => {
      expect(buildChannelUiCatalog([])).toEqual({ entries: [] });
    });

    it("maps a single entry with only a provider", () => {
      const catalog = buildChannelUiCatalog([{ provider: "slack" }]);
      expect(catalog.entries).toHaveLength(1);
      expect(catalog.entries[0]).toEqual({
        provider: "slack",
        label: undefined,
        description: undefined,
        iconUrl: undefined,
      });
    });

    it("preserves label, description and iconUrl", () => {
      const catalog = buildChannelUiCatalog([
        {
          provider: "discord",
          label: "Discord",
          description: "Discord channel",
          iconUrl: "https://example.com/icon.png",
        },
      ]);
      expect(catalog.entries[0]).toEqual({
        provider: "discord",
        label: "Discord",
        description: "Discord channel",
        iconUrl: "https://example.com/icon.png",
      });
    });

    it("maps multiple entries preserving order", () => {
      const catalog = buildChannelUiCatalog([
        { provider: "slack" },
        { provider: "discord" },
        { provider: "telegram" },
      ]);
      expect(catalog.entries.map((e) => e.provider)).toEqual([
        "slack",
        "discord",
        "telegram",
      ]);
    });

    it("ignores extra unknown fields on entries", () => {
      const entry = {
        provider: "slack",
        extra: "ignored",
        bundled: true,
      } as ChannelPluginCatalogEntry;
      const catalog = buildChannelUiCatalog([entry]);
      expect(catalog.entries[0]).not.toHaveProperty("extra");
      expect(catalog.entries[0]).not.toHaveProperty("bundled");
    });
  });

  describe("listRawChannelPluginCatalogEntries", () => {
    it("returns an empty array with no params", () => {
      expect(listRawChannelPluginCatalogEntries()).toEqual([]);
    });

    it("returns an empty array regardless of params", () => {
      expect(listRawChannelPluginCatalogEntries({ includeBundled: true })).toEqual([]);
    });
  });

  describe("listChannelPluginCatalogEntries", () => {
    it("returns an empty array with no params", () => {
      expect(listChannelPluginCatalogEntries()).toEqual([]);
    });

    it("returns an empty array regardless of params", () => {
      expect(listChannelPluginCatalogEntries({ filter: "all" })).toEqual([]);
    });
  });

  describe("getChannelPluginCatalogEntry", () => {
    it("returns null for a known-looking provider (no plugin discovery)", () => {
      expect(getChannelPluginCatalogEntry({ provider: "slack" })).toBeNull();
    });

    it("returns null for an empty provider", () => {
      expect(getChannelPluginCatalogEntry({ provider: "" })).toBeNull();
    });

    it("returns null for a whitespace-only provider", () => {
      expect(getChannelPluginCatalogEntry({ provider: "   " })).toBeNull();
    });
  });
});
