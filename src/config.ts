import * as fs from "fs";
import { join } from "path";
import type { PluginConfig } from "./types";
import { stripJsonComments } from "./utils/jsonc";
import { getOpenCodeConfigDir } from "./utils/paths";

const CONFIG_FILE_NAMES = ["smart-codebase.jsonc", "smart-codebase.json"];

const DEFAULT_CONFIG: PluginConfig = {
  enabled: true,
  debounceMs: 60000,
  autoExtract: true,
  autoInject: true,
  disabledCommands: [],
  extractionMaxTokens: 8000,
  cleanupThresholds: {
    minAgeDays: 60,
    minAccessCount: 5,
    maxInactiveDays: 60,
  },
};

export function loadConfig(): PluginConfig {
  const configDir = getOpenCodeConfigDir();
  
  for (const fileName of CONFIG_FILE_NAMES) {
    const configPath = join(configDir, fileName);
    
    if (!fs.existsSync(configPath)) {
      continue;
    }
    
    try {
      const content = fs.readFileSync(configPath, "utf-8");
      const cleanJson = stripJsonComments(content);
      const userConfig = JSON.parse(cleanJson) as Partial<PluginConfig>;
      return { ...DEFAULT_CONFIG, ...userConfig };
    } catch (error) {
      console.error(`[smart-codebase] Failed to parse ${fileName}:`, error);
      return DEFAULT_CONFIG;
    }
  }
  
  return DEFAULT_CONFIG;
}
