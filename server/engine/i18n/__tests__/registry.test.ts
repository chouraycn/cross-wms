/**
 * 服务端 i18n 注册中心单元测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  I18nRegistry,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  type LocaleCode,
} from "../index.js";

describe("I18nRegistry", () => {
  let registry: I18nRegistry;

  beforeEach(() => {
    registry = new I18nRegistry();
  });

  describe("defaults", () => {
    it("uses zh-CN as the default locale", () => {
      expect(registry.getLocale()).toBe(DEFAULT_LOCALE);
      expect(DEFAULT_LOCALE).toBe("zh-CN");
    });

    it("uses en as the fallback locale", () => {
      expect(registry.getFallbackLocale()).toBe(FALLBACK_LOCALE);
      expect(FALLBACK_LOCALE).toBe("en");
    });

    it("exposes the supported locales", () => {
      expect(SUPPORTED_LOCALES).toContain("zh-CN");
      expect(SUPPORTED_LOCALES).toContain("en");
    });
  });

  describe("listLocales", () => {
    it("lists the registered locales", () => {
      const locales = registry.listLocales();
      const codes = locales.map((l) => l.code);
      expect(codes).toEqual(expect.arrayContaining(["zh-CN", "en"]));
    });
  });

  describe("setLocale / getLocale", () => {
    it("switches to a registered locale", () => {
      expect(registry.setLocale("en")).toBe(true);
      expect(registry.getLocale()).toBe("en");
    });

    it("returns false for an unknown locale", () => {
      expect(registry.setLocale("fr" as LocaleCode)).toBe(false);
      expect(registry.getLocale()).toBe("zh-CN");
    });

    it("is idempotent when re-selecting the current locale", () => {
      expect(registry.setLocale("en")).toBe(true);
      expect(registry.setLocale("en")).toBe(true);
      expect(registry.getLocale()).toBe("en");
    });
  });

  describe("t (translation)", () => {
    it("returns the value for a flat key", () => {
      expect(registry.t("common.success")).toBe("操作成功");
    });

    it("returns the value for a nested key", () => {
      expect(registry.t("chat.messageTooLong")).toBe("消息过长");
    });

    it("returns the value for the active locale when present", () => {
      registry.setLocale("en");
      expect(registry.t("common.success")).toBe("Success");
    });

    it("falls back to the fallback locale when key is missing in current locale", () => {
      // Register a custom locale that does not have the key, so fallback to en kicks in.
      const customCode = "ja" as LocaleCode;
      registry.registerLocale({
        code: customCode,
        name: "Japanese",
        nativeName: "日本語",
        messages: { greeting: "こんにちは" },
      });
      registry.setFallbackLocale("en");
      registry.setLocale(customCode);
      // common.success exists in en (fallback) but not in custom locale
      expect(registry.t("common.success")).toBe("Success");
    });

    it("returns the defaultValue when key is missing in both locales", () => {
      expect(registry.t("foo.bar.baz", { defaultValue: "DEFAULT" })).toBe("DEFAULT");
    });

    it("returns the key itself when nothing matches and no defaultValue", () => {
      expect(registry.t("foo.bar.baz")).toBe("foo.bar.baz");
    });

    it("honors the locale override in options", () => {
      const value = registry.t("common.success", { locale: "en" });
      expect(value).toBe("Success");
    });
  });

  describe("format", () => {
    it("substitutes placeholders", () => {
      const value = registry.format("daemon.pid", { pid: 1234 });
      expect(value).toBe("PID: 1234");
    });

    it("leaves missing placeholders untouched", () => {
      const value = registry.format("daemon.pid", {});
      expect(value).toBe("PID: {pid}");
    });

    it("supports multiple placeholders in a single template", () => {
      // ensure {name} {count} {command} all work
      const value = registry.format("tui.commandNotFound", { command: "/foo" });
      expect(value).toBe("命令未找到: /foo");
    });
  });

  describe("plural", () => {
    it("uses the singular form for count === 1", () => {
      const value = registry.plural("cron.jobTriggered", 1);
      expect(value).toBe("定时任务已触发");
    });

    it("falls back to the singular default when the plural form is missing", () => {
      const value = registry.plural("cron.jobTriggered", 5);
      expect(value).toBe("定时任务已触发");
    });

    it("substitutes the {count} placeholder when present", () => {
      registry.registerLocale({
        code: "ja" as LocaleCode,
        name: "Japanese",
        nativeName: "日本語",
        messages: {
          items: "1 个项目",
          items_plural: "{count} 个项目",
        },
      });
      registry.setLocale("ja" as LocaleCode);
      expect(registry.plural("items", 1)).toBe("1 个项目");
      expect(registry.plural("items", 5)).toBe("5 个项目");
    });
  });

  describe("hasLocale / has", () => {
    it("hasLocale returns true for registered locales", () => {
      expect(registry.hasLocale("zh-CN")).toBe(true);
      expect(registry.hasLocale("en")).toBe(true);
    });

    it("hasLocale returns false for unknown locales", () => {
      expect(registry.hasLocale("fr" as LocaleCode)).toBe(false);
    });

    it("has returns true for known keys", () => {
      expect(registry.has("common.success")).toBe(true);
    });

    it("has returns false for unknown keys", () => {
      expect(registry.has("does.not.exist")).toBe(false);
    });
  });

  describe("listeners", () => {
    it("invokes change listeners on locale change", () => {
      const seen: LocaleCode[] = [];
      registry.addChangeListener((locale) => {
        seen.push(locale);
      });
      registry.setLocale("en");
      expect(seen).toEqual(["en"]);
    });

    it("removes change listeners", () => {
      const seen: LocaleCode[] = [];
      const cb = (locale: LocaleCode) => {
        seen.push(locale);
      };
      registry.addChangeListener(cb);
      registry.setLocale("en");
      registry.removeChangeListener(cb);
      registry.setLocale("zh-CN");
      // only the first set should have triggered the callback
      expect(seen).toEqual(["en"]);
    });

    it("continues invoking other listeners when one throws", () => {
      const seen: LocaleCode[] = [];
      registry.addChangeListener(() => {
        throw new Error("boom");
      });
      registry.addChangeListener((locale) => {
        seen.push(locale);
      });
      registry.setLocale("en");
      expect(seen).toEqual(["en"]);
    });
  });

  describe("register / unregister", () => {
    it("registers a new locale and resolves keys from it", () => {
      registry.registerLocale({
        code: "ja" as LocaleCode,
        name: "Japanese",
        nativeName: "日本語",
        messages: { hello: "こんにちは" },
      });
      expect(registry.hasLocale("ja" as LocaleCode)).toBe(true);
    });

    it("refuses to unregister the current locale", () => {
      registry.unregisterLocale("zh-CN");
      expect(registry.hasLocale("zh-CN")).toBe(true);
    });

    it("unregisters a non-current locale", () => {
      registry.unregisterLocale("en");
      expect(registry.hasLocale("en")).toBe(false);
    });
  });

  describe("clear", () => {
    it("resets the registry state", () => {
      registry.setLocale("en");
      registry.clear();
      expect(registry.getLocale()).toBe(DEFAULT_LOCALE);
      expect(registry.listLocales()).toHaveLength(0);
    });
  });
});
