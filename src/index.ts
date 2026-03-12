import type { Plugin } from "@opencode-ai/plugin";
import { updateCommand } from "./commands/update";
import { createContextInjectorHook } from "./hooks/context-injector";
import { setPluginInput } from "./plugin-context";
import { loadConfig } from "./config";

const ALL_COMMANDS = {
  "sc-update": updateCommand,
} as const;

const COMMAND_CONFIGS = {
  "sc-update": {
    template: "Use sc-update to analyze the current session and update project SKILL files.",
    description: "Update project SKILL files",
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

    const disabledCommands = new Set<string>();
    
    const enabledTools: Record<string, typeof updateCommand> = {};
    const enabledCommandConfigs: Record<string, { template: string; description: string }> = {};
    
    for (const [name, command] of Object.entries(ALL_COMMANDS)) {
      if (!disabledCommands.has(name)) {
        enabledTools[name] = command;
        enabledCommandConfigs[name] = COMMAND_CONFIGS[name as keyof typeof COMMAND_CONFIGS];
      }
    }

    const contextInjector = createContextInjectorHook(input);
    
    let hasShownWelcomeToast = false;

    return {
      tool: enabledTools,
       "chat.message": async (hookInput, output) => {
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
              duration: 5000,
            },
          }).catch(() => {});
        }
        
        await contextInjector.event?.(hookInput);
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
