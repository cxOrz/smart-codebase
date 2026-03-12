import type { PluginInput, Hooks } from "@opencode-ai/plugin";
import { join } from "path";
import { fileExists } from "../utils/fs-compat";
import { getProjectSkillName } from "../utils/skill-helpers";

type ChatMessageInput = Parameters<NonNullable<Hooks["chat.message"]>>[0];
type ChatMessageOutput = Parameters<NonNullable<Hooks["chat.message"]>>[1];
type EventInput = Parameters<NonNullable<Hooks["event"]>>[0];

export function createContextInjectorHook(ctx: PluginInput) {
  const sessionKnowledgeInjected = new Set<string>();

  const chatMessage = async (
    input: ChatMessageInput,
    output: ChatMessageOutput,
  ) => {
    if (sessionKnowledgeInjected.has(input.sessionID)) {
      return;
    }

    try {
      const skillName = getProjectSkillName(ctx.directory);
      const skillPath = join(ctx.directory, '.opencode', 'skills', skillName, 'SKILL.md');
      const hasSkill = await fileExists(skillPath);

      sessionKnowledgeInjected.add(input.sessionID);

      if (!hasSkill) {
        return;
      }

      const hint = `Use skill(name="${skillName}") to load project knowledge.`;

      const textPart = output.parts.find(
        (p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text'
      );

      if (textPart && 'text' in textPart) {
        (textPart as { type: 'text'; text: string }).text = hint + '\n\n' + (textPart as { type: 'text'; text: string }).text;
      }

      console.log(`[smart-codebase] Injected skill hint for session ${input.sessionID}`);
    } catch (error) {
      console.error('[smart-codebase] Failed to inject skill hint:', error);
      sessionKnowledgeInjected.add(input.sessionID);
    }
  };

  const eventHandler = async ({ event }: EventInput) => {
    const props = event.properties as Record<string, unknown> | undefined;

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined;
      if (sessionInfo?.id) {
        sessionKnowledgeInjected.delete(sessionInfo.id);
      }
    }
  };

  return {
    "chat.message": chatMessage,
    event: eventHandler,
  };
}
