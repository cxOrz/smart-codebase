import { test, expect } from "bun:test";
import type {
  UsageMetadata,
  CleanupThresholds,
  PluginConfig,
} from "../types";

test("UsageMetadata interface exists and has required fields", () => {
  // This test verifies the type structure at compile time
  // The following would fail to compile if the interface doesn't exist or lacks fields
  const metadata: UsageMetadata = {
    created_at: "2024-01-01T00:00:00Z",
    last_accessed: "2024-01-02T00:00:00Z",
    access_count: 5,
    last_updated: "2024-01-03T00:00:00Z",
  };

  expect(metadata.created_at).toBe("2024-01-01T00:00:00Z");
  expect(metadata.last_accessed).toBe("2024-01-02T00:00:00Z");
  expect(metadata.access_count).toBe(5);
  expect(metadata.last_updated).toBe("2024-01-03T00:00:00Z");
});

test("UsageMetadata fields are correct types", () => {
  const metadata: UsageMetadata = {
    created_at: "2024-01-01T00:00:00Z",
    last_accessed: "2024-01-02T00:00:00Z",
    access_count: 42,
    last_updated: "2024-01-03T00:00:00Z",
  };

  expect(typeof metadata.created_at).toBe("string");
  expect(typeof metadata.last_accessed).toBe("string");
  expect(typeof metadata.access_count).toBe("number");
  expect(typeof metadata.last_updated).toBe("string");
});

test("CleanupThresholds interface exists and has required fields", () => {
  const thresholds: CleanupThresholds = {
    minAgeDays: 30,
    minAccessCount: 1,
    maxInactiveDays: 90,
  };

  expect(thresholds.minAgeDays).toBe(30);
  expect(thresholds.minAccessCount).toBe(1);
  expect(thresholds.maxInactiveDays).toBe(90);
});

test("CleanupThresholds fields are correct types", () => {
  const thresholds: CleanupThresholds = {
    minAgeDays: 30,
    minAccessCount: 1,
    maxInactiveDays: 90,
  };

  expect(typeof thresholds.minAgeDays).toBe("number");
  expect(typeof thresholds.minAccessCount).toBe("number");
  expect(typeof thresholds.maxInactiveDays).toBe("number");
});

test("PluginConfig can include optional cleanupThresholds field", () => {
  const configWithCleanup: PluginConfig = {
    enabled: true,
    cleanupThresholds: {
      minAgeDays: 30,
      minAccessCount: 1,
      maxInactiveDays: 90,
    },
  };

  expect(configWithCleanup.enabled).toBe(true);
  expect(configWithCleanup.cleanupThresholds).toBeDefined();
  expect(configWithCleanup.cleanupThresholds?.minAgeDays).toBe(30);
});

test("PluginConfig allows cleanupThresholds to be undefined", () => {
  const configWithoutCleanup: PluginConfig = {
    enabled: true,
  };

  expect(configWithoutCleanup.enabled).toBe(true);
  expect(configWithoutCleanup.cleanupThresholds).toBeUndefined();
});

test("PluginConfig preserves existing fields alongside cleanupThresholds", () => {
  const fullConfig: PluginConfig = {
    enabled: true,
    debounceMs: 60000,
    autoExtract: true,
    autoInject: true,
    extractionModel: "openai/gpt-4o",
    cleanupThresholds: {
      minAgeDays: 30,
      minAccessCount: 1,
      maxInactiveDays: 90,
    },
  };

  expect(fullConfig.enabled).toBe(true);
  expect(fullConfig.debounceMs).toBe(60000);
  expect(fullConfig.autoExtract).toBe(true);
  expect(fullConfig.autoInject).toBe(true);
  expect(fullConfig.extractionModel).toBe("openai/gpt-4o");
  expect(fullConfig.cleanupThresholds?.minAgeDays).toBe(30);
});
