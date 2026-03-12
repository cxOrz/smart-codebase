import { join } from "path";
import { getPluginInput } from "../plugin-context";
import { loadConfig } from "../config";
import type { PluginConfig } from "../types";
import type { Part } from "@opencode-ai/sdk";
import { buildInitSystemPrompt } from "./init-system-prompt";
import { parseModelConfig } from "./skill-updater";
import { getProjectSkillName } from "../utils/skill-helpers";
import { unwrapData, extractTextFromParts, withTimeout } from "../utils/sdk-helpers";

export async function initSkills(
  sessionID: string,
  config?: PluginConfig,
  focus?: string
): Promise<string> {
  const pluginInput = getPluginInput();
  const resolvedConfig = config ?? loadConfig();

  const projectRoot = pluginInput.directory;
  const skillName = getProjectSkillName(projectRoot);
  const skillDir = join(projectRoot, ".opencode", "skills", skillName);

  const systemPrompt = buildInitSystemPrompt({
    projectName: skillName,
    skillName,
    skillDir,
    focus,
  });

  const createResult = await pluginInput.client.session.create({
    body: { title: `SKILL Init`, parentID: sessionID },
  });
  const childSession = unwrapData(createResult as { data?: { id: string }; error?: Error });
  const childSessionID = childSession.id;

  try {
    const model = parseModelConfig(resolvedConfig.extractionModel);
    const promptResult = await withTimeout(
      pluginInput.client.session.prompt({
        path: { id: childSessionID },
        body: {
          system: systemPrompt,
          parts: [
            {
              type: "text",
              text: "Scan the project source code and generate comprehensive SKILL documentation.",
            },
          ],
          tools: { read: true, write: true, edit: true, glob: true, grep: true, bash: true },
          ...(model && { model }),
        },
      }),
      600000
    );
    const responseMessage = unwrapData(
      promptResult as { data?: { parts: Part[] }; error?: Error }
    );
    return extractTextFromParts(responseMessage.parts) || "SKILL initialization complete.";
  } finally {
    try {
      await pluginInput.client.session.delete({ path: { id: childSessionID } });
    } catch {
    }
  }
}
