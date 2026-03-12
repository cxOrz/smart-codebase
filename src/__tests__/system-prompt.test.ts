// @ts-ignore bun test runtime import
import { describe, test, expect } from "bun:test";
import { buildExtractionSystemPrompt } from "../extraction/system-prompt";

describe("buildExtractionSystemPrompt", () => {
  const baseOptions = {
    projectName: "test-project",
    skillName: "test-project",
    skillDir: "/test/.opencode/skills/test-project",
    conversationSummary: "User asked about auth. AI implemented JWT.",
  };

  test("includes project name", () => {
    const prompt = buildExtractionSystemPrompt(baseOptions);
    expect(prompt).toContain("test-project");
  });

  test("includes skill directory path", () => {
    const prompt = buildExtractionSystemPrompt(baseOptions);
    expect(prompt).toContain("/test/.opencode/skills/test-project");
  });

  test("includes conversation summary", () => {
    const prompt = buildExtractionSystemPrompt(baseOptions);
    expect(prompt).toContain("User asked about auth");
  });

  test("includes focus when provided", () => {
    const prompt = buildExtractionSystemPrompt({
      ...baseOptions,
      focus: "authentication module",
    });
    expect(prompt).toContain("authentication module");
  });

  test("omits focus section when not provided", () => {
    const prompt = buildExtractionSystemPrompt(baseOptions);
    expect(prompt).not.toMatch(/Focus especially on:\s*$/m);
  });

  test("returns non-empty string", () => {
    const prompt = buildExtractionSystemPrompt(baseOptions);
    expect(prompt.length).toBeGreaterThan(100);
  });

  test("includes value check rule that prevents unnecessary updates", () => {
    const prompt = buildExtractionSystemPrompt(baseOptions);
    expect(prompt).toContain("Value check");
    expect(prompt).toContain("no valuable");
  });
});
