import type { PluginInput, Hooks } from "@opencode-ai/plugin";
import type { PluginConfig } from "../types";
import { join } from "path";
import { fileExists } from "../utils/fs-compat";

type ChatMessageInput = Parameters<NonNullable<Hooks["chat.message"]>>[0];
type ChatMessageOutput = Parameters<NonNullable<Hooks["chat.message"]>>[1];
type EventInput = Parameters<NonNullable<Hooks["event"]>>[0];

export function createContextInjectorHook(ctx: PluginInput, config?: PluginConfig) {
  const sessionKnowledgeInjected = new Set<string>();

  const chatMessage = async (
    input: ChatMessageInput,
    output: ChatMessageOutput,
  ) => {
    if (config?.autoInject === false) {
      return;
    }

    if (sessionKnowledgeInjected.has(input.sessionID)) {
      return;
    }

    try {
      const knowledgePath = join(ctx.directory, '.knowledge', 'KNOWLEDGE.md');
      const hasKnowledge = await fileExists(knowledgePath);

      if (!hasKnowledge) {
        sessionKnowledgeInjected.add(input.sessionID);
        return;
      }

      const knowledgeHint = `

---
**[REQUIRED FIRST STEP]** Before any other action, read \`.knowledge/KNOWLEDGE.md\` to discover available project knowledge. Then read relevant \`.knowledge/SKILL.md\` files for modules you'll modify. Do NOT skip this step.
---

`;

      const textParts = output.parts.filter(
        (p): p is typeof p & { type: 'text'; text: string } => 
          p.type === 'text' && typeof (p as any).text === 'string'
      );

      if (textParts.length > 0) {
        (textParts[0] as any).text = knowledgeHint + (textParts[0] as any).text;
      }

      sessionKnowledgeInjected.add(input.sessionID);
      console.log(`[smart-codebase] Injected knowledge hint for session ${input.sessionID}`);
    } catch (error) {
      console.error('[smart-codebase] Failed to inject knowledge hint:', error);
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
