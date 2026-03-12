import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const ORIGINAL_ENV = { ...process.env };
const existsSyncMock = mock(() => false);
const readFileSyncMock = mock(() => "");

mock.module("fs", () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
}));

describe("loadConfig", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, XDG_CONFIG_HOME: "/tmp/test-opencode-config-base" };
    existsSyncMock.mockReset();
    readFileSyncMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  test("returns default config when no file exists", async () => {
    existsSyncMock.mockReturnValue(false);

    const { loadConfig } = await import("../config");
    const config = loadConfig();

    expect(config.enabled).toBe(true);
    expect(config.extractionMaxTokens).toBeGreaterThan(0);
  });

  test("default config has required fields", async () => {
    existsSyncMock.mockReturnValue(false);
    const { loadConfig } = await import("../config");
    const config = loadConfig();

    expect(config).toHaveProperty("enabled");
    expect(config).toHaveProperty("extractionMaxTokens");
    expect(config.enabled).toBe(true);
  });

  test("merges user config with defaults", async () => {
    existsSyncMock.mockImplementation((path: string) => path.endsWith("/opencode/smart-codebase.json"));
    readFileSyncMock.mockReturnValue(
      JSON.stringify({
        enabled: false,
        extractionModel: "openai/gpt-4o",
      })
    );

    const { loadConfig } = await import("../config");
    const config = loadConfig();

    expect(config.enabled).toBe(false);
    expect(config.extractionModel).toBe("openai/gpt-4o");
    expect(config.extractionMaxTokens).toBe(16000);
  });

  test("supports jsonc comments", async () => {
    existsSyncMock.mockImplementation((path: string) => path.endsWith("/opencode/smart-codebase.jsonc"));
    readFileSyncMock.mockReturnValue(`{\n// comment\n"enabled": true,\n"extractionMaxTokens": 8000\n}`);

    const { loadConfig } = await import("../config");
    const config = loadConfig();

    expect(config.enabled).toBe(true);
    expect(config.extractionMaxTokens).toBe(8000);
  });
});
