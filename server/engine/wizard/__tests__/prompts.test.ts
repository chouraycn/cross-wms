import { describe, expect, it } from "vitest";
import { WizardCancelledError, createMockPrompter } from "../prompts.js";

describe("wizard prompts", () => {
  it("WizardCancelledError has correct name and message", () => {
    const error = new WizardCancelledError();
    expect(error.name).toBe("WizardCancelledError");
    expect(error.message).toBe("wizard cancelled");

    const customError = new WizardCancelledError("custom message");
    expect(customError.message).toBe("custom message");
  });

  it("createMockPrompter returns a valid prompter with defaults", async () => {
    const prompter = createMockPrompter();

    expect(typeof prompter.intro).toBe("function");
    expect(typeof prompter.outro).toBe("function");
    expect(typeof prompter.note).toBe("function");
    expect(typeof prompter.select).toBe("function");
    expect(typeof prompter.multiselect).toBe("function");
    expect(typeof prompter.text).toBe("function");
    expect(typeof prompter.confirm).toBe("function");
    expect(typeof prompter.progress).toBe("function");
  });

  it("createMockPrompter select returns initialValue if provided", async () => {
    const prompter = createMockPrompter();
    const result = await prompter.select({
      message: "test",
      options: [
        { value: "a", label: "Option A" },
        { value: "b", label: "Option B" },
      ],
      initialValue: "b",
    });
    expect(result).toBe("b");
  });

  it("createMockPrompter select returns first option value if no initialValue", async () => {
    const prompter = createMockPrompter();
    const result = await prompter.select({
      message: "test",
      options: [
        { value: "a", label: "Option A" },
        { value: "b", label: "Option B" },
      ],
    });
    expect(result).toBe("a");
  });

  it("createMockPrompter text returns initialValue if provided", async () => {
    const prompter = createMockPrompter();
    const result = await prompter.text({
      message: "test",
      initialValue: "hello",
    });
    expect(result).toBe("hello");
  });

  it("createMockPrompter text returns empty string if no initialValue", async () => {
    const prompter = createMockPrompter();
    const result = await prompter.text({ message: "test" });
    expect(result).toBe("");
  });

  it("createMockPrompter confirm returns initialValue if provided", async () => {
    const prompter = createMockPrompter();
    const result = await prompter.confirm({
      message: "test",
      initialValue: true,
    });
    expect(result).toBe(true);
  });

  it("createMockPrompter confirm returns false if no initialValue", async () => {
    const prompter = createMockPrompter();
    const result = await prompter.confirm({ message: "test" });
    expect(result).toBe(false);
  });

  it("createMockPrompter multiselect returns initialValues if provided", async () => {
    const prompter = createMockPrompter();
    const result = await prompter.multiselect({
      message: "test",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      initialValues: ["a", "b"],
    });
    expect(result).toEqual(["a", "b"]);
  });

  it("createMockPrompter multiselect returns empty array if no initialValues", async () => {
    const prompter = createMockPrompter();
    const result = await prompter.multiselect({
      message: "test",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    });
    expect(result).toEqual([]);
  });

  it("createMockPrompter progress returns object with update and stop", () => {
    const prompter = createMockPrompter();
    const progress = prompter.progress("test");
    expect(typeof progress.update).toBe("function");
    expect(typeof progress.stop).toBe("function");
    expect(() => progress.update("new message")).not.toThrow();
    expect(() => progress.stop("done")).not.toThrow();
  });

  it("createMockPrompter intro/outro/note do not throw", async () => {
    const prompter = createMockPrompter();
    await expect(prompter.intro("test")).resolves.not.toThrow();
    await expect(prompter.outro("test")).resolves.not.toThrow();
    await expect(prompter.note("test")).resolves.not.toThrow();
    await expect(prompter.note("test", "title")).resolves.not.toThrow();
  });

  it("createMockPrompter allows overriding individual methods", async () => {
    const customSelect = async () => "custom";
    const prompter = createMockPrompter({ select: customSelect });
    const result = await prompter.select({
      message: "test",
      options: [{ value: "a", label: "A" }],
    });
    expect(result).toBe("custom");
  });
});
