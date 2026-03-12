import { describe, test, expect } from "bun:test";
import type { PluginConfig } from "../types";

describe("PluginConfig", () => {
  test("accepts minimal config", () => {
    const config: PluginConfig = { enabled: true, extractionMaxTokens: 8000 };
    expect(config.enabled).toBe(true);
    expect(config.extractionMaxTokens).toBe(8000);
  });

  test("extractionModel is optional", () => {
    const config: PluginConfig = { enabled: true, extractionMaxTokens: 8000 };
    expect(config.extractionModel).toBeUndefined();
  });
});
