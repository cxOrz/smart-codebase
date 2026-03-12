import { tool } from "@opencode-ai/plugin";
import { initSkills } from "../extraction/skill-initializer";
import { loadConfig } from "../config";

export const initCommand = tool({
  description:
    "Initialize project SKILL files by scanning source code (AI-agentic: scans project files and generates comprehensive SKILL.md and reference/ files)",
  args: {
    focus: tool.schema
      .string()
      .describe(
        "Optional focus area for initial scan (e.g. 'auth module', 'API design', 'build pipeline')"
      )
      .optional(),
  },
  async execute(input, ctx) {
    const config = loadConfig();
    const result = await initSkills(ctx.sessionID, config, input.focus);
    return result;
  },
});
