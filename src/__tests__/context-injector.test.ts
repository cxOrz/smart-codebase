import { beforeEach, describe, expect, mock, test } from "bun:test";

const fileExistsMock = mock(async () => true);

mock.module("../utils/fs-compat", () => ({
  fileExists: fileExistsMock,
}));

describe("createContextInjectorHook", () => {
  beforeEach(() => {
    fileExistsMock.mockReset();
    fileExistsMock.mockResolvedValue(true);
  });

  test("injects skill hint into first message", async () => {
    const { createContextInjectorHook } = await import("../hooks/context-injector");

    const hook = createContextInjectorHook({ directory: "/repo/my-project" } as any);
    const output = {
      parts: [{ type: "text", text: "Original assistant message." }],
    } as any;

    await hook["chat.message"]({ sessionID: "s1" } as any, output);

    expect(output.parts[0].text).toContain(
      'Use skill(name="my-project") to load project knowledge.'
    );
    expect(output.parts[0].text).toContain("Original assistant message.");
    expect(fileExistsMock).toHaveBeenCalledTimes(1);
  });

  test("deduplicates injection per session", async () => {
    const { createContextInjectorHook } = await import("../hooks/context-injector");

    const hook = createContextInjectorHook({ directory: "/repo/my-project" } as any);
    const output = {
      parts: [{ type: "text", text: "Hello" }],
    } as any;

    await hook["chat.message"]({ sessionID: "s2" } as any, output);
    const afterFirst = output.parts[0].text;

    await hook["chat.message"]({ sessionID: "s2" } as any, output);

    expect(output.parts[0].text).toBe(afterFirst);
    expect(
      (output.parts[0].text.match(/Use skill\(name="my-project"\) to load project knowledge\./g) ?? [])
        .length
    ).toBe(1);
    expect(fileExistsMock).toHaveBeenCalledTimes(1);
  });

  test("cleans dedupe state on session.deleted event", async () => {
    const { createContextInjectorHook } = await import("../hooks/context-injector");

    const hook = createContextInjectorHook({ directory: "/repo/my-project" } as any);
    const output = {
      parts: [{ type: "text", text: "Hi" }],
    } as any;

    await hook["chat.message"]({ sessionID: "s3" } as any, output);
    await hook.event({
      event: {
        type: "session.deleted",
        properties: { info: { id: "s3" } },
      },
    } as any);

    const secondOutput = {
      parts: [{ type: "text", text: "After delete" }],
    } as any;

    await hook["chat.message"]({ sessionID: "s3" } as any, secondOutput);

    expect(fileExistsMock).toHaveBeenCalledTimes(2);
    expect(secondOutput.parts[0].text).toContain(
      'Use skill(name="my-project") to load project knowledge.'
    );
  });
});
