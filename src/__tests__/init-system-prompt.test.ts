// @ts-ignore bun test runtime import
import { describe, test, expect } from "bun:test";
import { buildInitSystemPrompt } from "../extraction/init-system-prompt";

describe("buildInitSystemPrompt", () => {
  const baseOptions = {
    projectName: "test-project",
    skillName: "test-project",
    skillDir: "/test/.opencode/skills/test-project",
  };

  test("includes project name", () => {
    const prompt = buildInitSystemPrompt(baseOptions);
    expect(prompt).toContain("test-project");
  });

  test("includes skill directory path", () => {
    const prompt = buildInitSystemPrompt(baseOptions);
    expect(prompt).toContain(baseOptions.skillDir);
  });

  test("includes focus when provided", () => {
    const prompt = buildInitSystemPrompt({ ...baseOptions, focus: "auth module" });
    expect(prompt).toContain("auth module");
  });

  test("omits focus section when not provided", () => {
    const prompt = buildInitSystemPrompt(baseOptions);
    expect(prompt).not.toMatch(/Focus especially on:\s*$/m);
  });

  test("includes scanning strategy instructions", () => {
    const prompt = buildInitSystemPrompt(baseOptions);
    expect(prompt).toMatch(/Scanning strategy|bash/);
  });

  test("includes exclusion list", () => {
    const prompt = buildInitSystemPrompt(baseOptions);
    expect(prompt).toContain("node_modules");
  });

  test("returns non-empty string", () => {
    const prompt = buildInitSystemPrompt(baseOptions);
    expect(prompt.length).toBeGreaterThan(100);
  });
});
