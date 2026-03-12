import { beforeEach, describe, expect, mock, test } from "bun:test";

let currentPluginInput: any;

mock.module("../plugin-context", () => ({
  getPluginInput: () => currentPluginInput,
  setPluginInput: mock(() => {}),
}));

describe("updateSkills", () => {
  beforeEach(() => {
    currentPluginInput = undefined;
  });

  test("calls session.messages with correct sessionID", async () => {
    const mockMessages = [
      { info: { role: "user" }, parts: [{ type: "text", text: "Help me with auth" }] },
      { info: { role: "assistant" }, parts: [{ type: "text", text: "I'll implement JWT" }] },
    ];

    const mockSessionDelete = mock(() => Promise.resolve({ data: {} }));
    const messagesMock = mock(() => Promise.resolve({ data: mockMessages }));
    const createMock = mock(() => Promise.resolve({ data: { id: "child-session-id" } }));
    const promptMock = mock(() =>
      Promise.resolve({ data: { parts: [{ type: "text", text: "SKILL updated." }] } })
    );

    currentPluginInput = {
      directory: "/test/project",
      client: {
        session: {
          messages: messagesMock,
          create: createMock,
          prompt: promptMock,
          delete: mockSessionDelete,
        },
      },
    };

    const { updateSkills } = await import("../extraction/skill-updater");
    const result = await updateSkills("test-session-id", {
      enabled: true,
      extractionMaxTokens: 8000,
    });

    expect(messagesMock).toHaveBeenCalledWith({
      path: { id: "test-session-id" },
    });
    expect(createMock).toHaveBeenCalled();
    expect(promptMock).toHaveBeenCalled();
    expect(typeof result).toBe("string");
  });

  test("always deletes child session in finally block", async () => {
    const mockSessionDelete = mock(() => Promise.resolve({ data: {} }));

    currentPluginInput = {
      directory: "/test/project",
      client: {
        session: {
          messages: mock(() => Promise.resolve({ data: [] })),
          create: mock(() => Promise.resolve({ data: { id: "child-id" } })),
          prompt: mock(() => Promise.reject(new Error("AI failed"))),
          delete: mockSessionDelete,
        },
      },
    };

    const { updateSkills } = await import("../extraction/skill-updater");

    await expect(
      updateSkills("session-id", { enabled: true, extractionMaxTokens: 8000 })
    ).rejects.toThrow("AI failed");

    expect(mockSessionDelete).toHaveBeenCalledWith({ path: { id: "child-id" } });
  });
});
