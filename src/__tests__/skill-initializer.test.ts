// @ts-ignore bun test runtime import
import { beforeEach, describe, expect, mock, test } from "bun:test";

let currentPluginInput: any;

mock.module("../plugin-context", () => ({
  getPluginInput: () => currentPluginInput,
  setPluginInput: mock(() => {}),
}));

describe("initSkills", () => {
  beforeEach(() => {
    currentPluginInput = undefined;
  });

  test("creates child session with SKILL Init title", async () => {
    const createMock = mock(() => Promise.resolve({ data: { id: "child-id" } }));
    const promptMock = mock(() => Promise.resolve({ data: { parts: [{ type: "text", text: "ok" }] } }));
    const deleteMock = mock(() => Promise.resolve({ data: {} }));

    currentPluginInput = {
      directory: "/test/project",
      client: {
        session: {
          create: createMock,
          prompt: promptMock,
          delete: deleteMock,
        },
      },
    };

    const { initSkills } = await import("../extraction/skill-initializer");
    await initSkills("test-session-id", { enabled: true, extractionMaxTokens: 8000 });

    expect(createMock).toHaveBeenCalledWith({
      body: { title: "SKILL Init", parentID: "test-session-id" },
    });
  });

  test("sends scan instruction to child session", async () => {
    const createMock = mock(() => Promise.resolve({ data: { id: "child-id" } }));
    const promptMock = mock(() => Promise.resolve({ data: { parts: [{ type: "text", text: "ok" }] } }));
    const deleteMock = mock(() => Promise.resolve({ data: {} }));

    currentPluginInput = {
      directory: "/test/project",
      client: {
        session: {
          create: createMock,
          prompt: promptMock,
          delete: deleteMock,
        },
      },
    };

    const { initSkills } = await import("../extraction/skill-initializer");
    await initSkills("test-session-id", { enabled: true, extractionMaxTokens: 8000 });

    expect(promptMock).toHaveBeenCalled();
    const firstCall = promptMock.mock.calls[0]?.[0];
    expect(firstCall.body.parts[0].text).toContain("Scan the project source code");
  });

  test("always deletes child session in finally block", async () => {
    const createMock = mock(() => Promise.resolve({ data: { id: "child-id" } }));
    const promptMock = mock(() => Promise.reject(new Error("AI failed")));
    const deleteMock = mock(() => Promise.resolve({ data: {} }));

    currentPluginInput = {
      directory: "/test/project",
      client: {
        session: {
          create: createMock,
          prompt: promptMock,
          delete: deleteMock,
        },
      },
    };

    const { initSkills } = await import("../extraction/skill-initializer");

    await expect(
      initSkills("test-session-id", { enabled: true, extractionMaxTokens: 8000 })
    ).rejects.toThrow("AI failed");

    expect(deleteMock).toHaveBeenCalledWith({ path: { id: "child-id" } });
  });

  test("returns text from response parts", async () => {
    const createMock = mock(() => Promise.resolve({ data: { id: "child-id" } }));
    const promptMock = mock(() =>
      Promise.resolve({ data: { parts: [{ type: "text", text: "SKILL initialized." }] } })
    );
    const deleteMock = mock(() => Promise.resolve({ data: {} }));

    currentPluginInput = {
      directory: "/test/project",
      client: {
        session: {
          create: createMock,
          prompt: promptMock,
          delete: deleteMock,
        },
      },
    };

    const { initSkills } = await import("../extraction/skill-initializer");
    const result = await initSkills("test-session-id", { enabled: true, extractionMaxTokens: 8000 });

    expect(result).toBe("SKILL initialized.");
  });

  test("does not call session.messages", async () => {
    const createMock = mock(() => Promise.resolve({ data: { id: "child-id" } }));
    const promptMock = mock(() => Promise.resolve({ data: { parts: [{ type: "text", text: "ok" }] } }));
    const deleteMock = mock(() => Promise.resolve({ data: {} }));

    currentPluginInput = {
      directory: "/test/project",
      client: {
        session: {
          create: createMock,
          prompt: promptMock,
          delete: deleteMock,
        },
      },
    };

    const { initSkills } = await import("../extraction/skill-initializer");
    await expect(
      initSkills("test-session-id", { enabled: true, extractionMaxTokens: 8000 })
    ).resolves.toBeString();
  });
});
