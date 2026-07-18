import { describe, expect, it } from "vitest";
import {
  WIZARD_DEFAULT_LOCALE,
  WIZARD_SUPPORTED_LOCALES,
  createSetupTranslator,
  listWizardI18nKeys,
  resolveWizardLocale,
  resolveWizardLocaleFromEnv,
  t,
} from "../i18n/index.js";

describe("wizard i18n", () => {
  it("resolves supported locales from explicit and system locale values", () => {
    expect(resolveWizardLocale("zh_CN.UTF-8")).toBe("zh-CN");
    expect(resolveWizardLocale("zh-Hans")).toBe("zh-CN");
    expect(resolveWizardLocale("en_US.UTF-8")).toBe("en");
    expect(resolveWizardLocale("de_DE.UTF-8")).toBe("en");
    expect(resolveWizardLocale(undefined)).toBe(WIZARD_DEFAULT_LOCALE);
    expect(resolveWizardLocale("")).toBe(WIZARD_DEFAULT_LOCALE);
  });

  it("uses LOCALE before other process locale variables", () => {
    expect(
      resolveWizardLocaleFromEnv({
        LOCALE: "zh-CN",
        LC_ALL: "en-US",
        LANG: "en-US",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("zh-CN");
  });

  it("falls back to English and interpolates params", () => {
    expect(t("wizard.gateway.port", undefined, { locale: "zh-CN" })).toBe("网关端口");
    expect(t("wizard.gateway.missing", undefined, { locale: "zh-CN" })).toBe(
      "wizard.gateway.missing",
    );
    expect(
      t(
        "wizard.gateway.port",
        undefined,
        { locale: "en" },
      ),
    ).toBe("Gateway port");
  });

  it("creates scoped setup translators", () => {
    const gatewayT = createSetupTranslator({
      keyPrefix: "wizard.gateway",
      locale: "zh-CN",
    });
    expect(gatewayT("port")).toBe("网关端口");
    expect(gatewayT("wizard.gateway.port")).toBe("网关端口");
    expect(gatewayT("common.skip")).toBe("跳过");
  });

  it("keeps shipped locale keys aligned with English", () => {
    const english = listWizardI18nKeys("en");
    for (const locale of WIZARD_SUPPORTED_LOCALES) {
      expect(listWizardI18nKeys(locale), locale).toEqual(english);
    }
  });

  it("supports English locale", () => {
    expect(t("common.skip", undefined, { locale: "en" })).toBe("Skip");
    expect(t("wizard.setup.intro", undefined, { locale: "en" })).toBe("Welcome to CrossWMS Setup Wizard");
  });

  it("supports Chinese locale", () => {
    expect(t("common.skip", undefined, { locale: "zh-CN" })).toBe("跳过");
    expect(t("wizard.setup.intro", undefined, { locale: "zh-CN" })).toBe("欢迎使用 CrossWMS 安装向导");
  });
});
