import { describe, it, expect, beforeEach } from "vitest";
import { PairingStore } from "../pairingStore.js";

describe("PairingStore 模块单元测试", () => {
  let store: PairingStore;

  beforeEach(() => {
    store = new PairingStore();
  });

  describe("pair", () => {
    it("应该建立双向配对关系", () => {
      store.pair("ch-a", "ch-b");
      expect(store.getPairedChannel("ch-a")).toBe("ch-b");
      expect(store.getPairedChannel("ch-b")).toBe("ch-a");
    });

    it("不能将频道与自身配对", () => {
      expect(() => store.pair("ch-a", "ch-a")).toThrow("Cannot pair a channel with itself");
    });

    it("重新配对应该覆盖旧配对", () => {
      store.pair("ch-a", "ch-b");
      store.pair("ch-a", "ch-c");

      expect(store.getPairedChannel("ch-a")).toBe("ch-c");
      expect(store.getPairedChannel("ch-c")).toBe("ch-a");
      // ch-b 应该被解除配对
      expect(store.isPaired("ch-b")).toBe(false);
    });

    it("三方重新配对应该正确解除旧关系", () => {
      store.pair("ch-a", "ch-b");
      store.pair("ch-b", "ch-c");

      // ch-b 现在与 ch-c 配对，ch-a 应该被解除
      expect(store.getPairedChannel("ch-b")).toBe("ch-c");
      expect(store.getPairedChannel("ch-c")).toBe("ch-b");
      expect(store.isPaired("ch-a")).toBe(false);
    });
  });

  describe("unpair", () => {
    it("应该解除配对关系", () => {
      store.pair("ch-a", "ch-b");
      store.unpair("ch-a");

      expect(store.isPaired("ch-a")).toBe(false);
      expect(store.isPaired("ch-b")).toBe(false);
    });

    it("解除未配对的频道应该不报错", () => {
      expect(() => store.unpair("ch-x")).not.toThrow();
    });
  });

  describe("getPairedChannel", () => {
    it("未配对的频道应该返回 null", () => {
      expect(store.getPairedChannel("ch-x")).toBeNull();
    });

    it("已配对的频道应该返回配对对象", () => {
      store.pair("ch-a", "ch-b");
      expect(store.getPairedChannel("ch-a")).toBe("ch-b");
    });
  });

  describe("isPaired", () => {
    it("未配对的频道应该返回 false", () => {
      expect(store.isPaired("ch-x")).toBe(false);
    });

    it("已配对的频道应该返回 true", () => {
      store.pair("ch-a", "ch-b");
      expect(store.isPaired("ch-a")).toBe(true);
      expect(store.isPaired("ch-b")).toBe(true);
    });
  });

  describe("clear", () => {
    it("应该清除所有配对", () => {
      store.pair("ch-a", "ch-b");
      store.pair("ch-c", "ch-d");
      store.clear();

      expect(store.isPaired("ch-a")).toBe(false);
      expect(store.isPaired("ch-b")).toBe(false);
      expect(store.isPaired("ch-c")).toBe(false);
      expect(store.isPaired("ch-d")).toBe(false);
    });
  });
});
