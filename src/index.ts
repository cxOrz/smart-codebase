import type { Plugin } from "@opencode-ai/plugin";
import { extractCommand } from "./commands/extract";
import { statusCommand } from "./commands/status";
import { rebuildIndexCommand } from "./commands/rebuild-index";
import { cleanupCommand } from "./commands/cleanup";
import { createContextInjectorHook } from "./hooks/context-injector";
import { createKnowledgeExtractorHook, cancelPendingExtraction } from "./hooks/knowledge-extractor";
import { setPluginInput } from "./plugin-context";
import { loadConfig } from "./config";
import { trackSkillAccess, shouldTrackPath } from "./storage/usage-tracker";

const ALL_COMMANDS = {
  "sc-extract": extractCommand,
  "sc-status": statusCommand,
  "sc-rebuild-index": rebuildIndexCommand,
  "sc-cleanup": cleanupCommand,
} as const;

const COMMAND_CONFIGS = {
  "sc-extract": {
    template: "Use sc-extract to manually trigger knowledge extraction. Analyzes modified files in current session and extracts valuable knowledge.",
    description: "Manually trigger knowledge extraction",
  },
  "sc-status": {
    template: "Use sc-status to display knowledge base status. Shows module count and index status.",
    description: "Display knowledge base status",
  },
  "sc-rebuild-index": {
    template: "Use sc-rebuild-index to rebuild global knowledge index. Scans all .knowledge/ directories and rebuilds .knowledge/KNOWLEDGE.md.",
    description: "Rebuild knowledge index",
  },
  "sc-cleanup": {
    template: "Use sc-cleanup to identify and remove low-usage SKILL files. Default is preview mode. Use --confirm to actually delete.",
    description: "Clean up low-usage SKILL files",
  },
} as const;

const SmartCodebasePlugin: Plugin = async (input) => {
  try {
    setPluginInput(input);
    
    const config = loadConfig();
    
    if (!config.enabled) {
      console.log("[smart-codebase] Plugin disabled via config");
      return {};
    }

    const disabledCommands = new Set(config.disabledCommands || []);
    
    const enabledTools: Record<string, typeof extractCommand> = {};
    const enabledCommandConfigs: Record<string, { template: string; description: string }> = {};
    
    for (const [name, command] of Object.entries(ALL_COMMANDS)) {
      if (!disabledCommands.has(name)) {
        enabledTools[name] = command;
        enabledCommandConfigs[name] = COMMAND_CONFIGS[name as keyof typeof COMMAND_CONFIGS];
      }
    }

    const contextInjector = createContextInjectorHook(input, config);
    const knowledgeExtractor = createKnowledgeExtractorHook(input, config);
    
    let hasShownWelcomeToast = false;

    return {
      tool: enabledTools,
      "tool.execute.after": async (hookInput, output) => {
        await knowledgeExtractor["tool.execute.after"]?.(hookInput, output);
        
        if (hookInput.tool === "read" && output.title) {
          const filePath = output.title;
          const projectRoot = input.directory;
          
          if (shouldTrackPath(filePath, projectRoot)) {
            await trackSkillAccess(filePath, projectRoot);
          }
        }
      },
       "chat.message": async (hookInput, output) => {
         // Cancel any pending extraction when user sends a message
         cancelPendingExtraction(hookInput.sessionID);
         
         await contextInjector["chat.message"]?.(hookInput, output);
       },
      event: async (hookInput) => {
        if (!hasShownWelcomeToast && hookInput.event.type === "session.created") {
          hasShownWelcomeToast = true;
          await input.client.tui.showToast({
            body: {
              title: "smart-codebase",
              message: "Knowledge base active",
              variant: "info",
              duration: 3000,
            },
          }).catch(() => {});
        }
        
        await contextInjector.event?.(hookInput);
        await knowledgeExtractor.event?.(hookInput);
      },
      config: async (cfg) => {
        cfg.command = {
          ...cfg.command,
          ...enabledCommandConfigs,
        };
      },
    };
  } catch (error) {
    console.error("[smart-codebase] Plugin initialization failed:", error);
    return {};
  }
};

export default SmartCodebasePlugin;
