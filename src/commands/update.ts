import { tool } from "@opencode-ai/plugin";
import { updateSkills } from "../extraction/skill-updater";
import { loadConfig } from "../config";

export const updateCommand = tool({
  description:
    "Update project SKILL files from current session knowledge (AI-agentic: analyzes session and writes/updates SKILL.md and reference/ files)",
  args: {
    focus: tool.schema
      .string()
      .describe(
        "Optional focus area for knowledge extraction (e.g. 'auth module', 'build pipeline', 'API design decisions')"
      )
      .optional(),
  },
  async execute(input, ctx) {
    const config = loadConfig();
    const result = await updateSkills(ctx.sessionID, config, input.focus);
    return result;
  },
});
