import type { Plugin } from "@opencode-ai/plugin";
import { updateCommand } from "./commands/update";
import { initCommand } from "./commands/init";
import { createContextInjectorHook } from "./hooks/context-injector";
import { setPluginInput } from "./plugin-context";
import { loadConfig } from "./config";

const SmartCodebasePlugin: Plugin = async (input) => {
  try {
    setPluginInput(input);
    const config = loadConfig();

    if (!config.enabled) {
      console.log("[smart-codebase] Plugin disabled via config");
      return {};
    }

    const contextInjector = createContextInjectorHook(input);

    return {
      tool: {
        "sc-update": updateCommand,
        "sc-init": initCommand,
      },
      "chat.message": async (hookInput, output) => {
        await contextInjector["chat.message"]?.(hookInput, output);
      },
      event: async (hookInput) => {
        await contextInjector.event?.(hookInput);
      },
      config: async (cfg) => {
        cfg.command = {
          ...cfg.command,
          "sc-update": {
            template: "sc-update $ARGUMENTS",
            description: "Update project SKILL files from session knowledge",
          },
          "sc-init": {
            template: "sc-init $ARGUMENTS",
            description: "Initialize project SKILL files from source code scan",
          },
        };
      },
    };
  } catch (error) {
    console.error("[smart-codebase] Plugin initialization failed:", error);
    return {};
  }
};

export default SmartCodebasePlugin;
