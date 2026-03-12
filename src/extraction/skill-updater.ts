import { join } from "path";
import { existsSync } from "node:fs";
import type { Part } from "@opencode-ai/sdk";
import { getPluginInput } from "../plugin-context";
import { loadConfig } from "../config";
import type { PluginConfig } from "../types";
import { buildExtractionSystemPrompt } from "./system-prompt";
import { getProjectSkillName } from "../utils/skill-helpers";
import { unwrapData, extractTextFromParts, withTimeout } from "../utils/sdk-helpers";

export function parseModelConfig(modelString?: string) {
  if (!modelString) return undefined;
  const [providerID, ...rest] = modelString.split("/");
  const modelID = rest.join("/");
  if (!providerID || !modelID) return undefined;
  return { providerID, modelID };
}

function extractTextFromMessageParts(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text!)
    .join("\n");
}

function buildConversationSummary(
  messages: Array<{ info: { role: string }; parts: Array<{ type: string; text?: string }> }>
): string {
  if (!messages || messages.length === 0) return "(No conversation messages found)";
  return messages
    .map((msg) => {
      const role = msg.info?.role ?? "unknown";
      const text = extractTextFromMessageParts(msg.parts ?? []);
      if (!text.trim()) return null;
      return `[${role.toUpperCase()}]\n${text}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
}

export async function updateSkills(
  sessionID: string,
  config?: PluginConfig,
  focus?: string
): Promise<string> {
  const pluginInput = getPluginInput();
  const resolvedConfig = config ?? loadConfig();

  const messagesResult = await pluginInput.client.session.messages({ path: { id: sessionID } });
  const messages = unwrapData(
    messagesResult as { data?: Array<{ info: { role: string }; parts: Array<{ type: string; text?: string }> }>; error?: Error }
  );
  const conversationSummary = buildConversationSummary(messages as any);

  const projectRoot = pluginInput.directory;
  const skillName = getProjectSkillName(projectRoot);
  const skillDir = join(projectRoot, ".opencode", "skills", skillName);

  const skillFileExists = existsSync(join(skillDir, "SKILL.md"));
  const noSkillHint = skillFileExists
    ? ""
    : "💡 Tip: Run /sc-init first to generate comprehensive project knowledge from source code.\n\n";

  const systemPrompt = buildExtractionSystemPrompt({
    projectName: skillName,
    skillName,
    skillDir,
    conversationSummary,
    focus,
  });

  const createResult = await pluginInput.client.session.create({
    body: { title: `SKILL Update`, parentID: sessionID },
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
              text: "Analyze the session and update the project SKILL files based on what was learned.",
            },
          ],
          tools: { read: true, write: true, edit: true, glob: true, grep: true, bash: true },
          ...(model && { model }),
        },
      }),
      300000
    );
     const responseMessage = unwrapData(
       promptResult as { data?: { parts: Part[] }; error?: Error }
     );
     return noSkillHint + (extractTextFromParts(responseMessage.parts) || "SKILL update complete.");
  } finally {
    try {
      await pluginInput.client.session.delete({ path: { id: childSessionID } });
    } catch {
      // ignore cleanup errors
    }
  }
}
