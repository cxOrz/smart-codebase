import type { PluginInput, Hooks } from "@opencode-ai/plugin";
import type { PluginConfig, ToolCallRecord } from "../types";
import { join } from "path";
import { 
  writeModuleSkill, 
  updateSkillIndex,
  getModulePath,
  getProjectSkillName,
  toSkillName,
  type SkillContent,
  type IndexEntry
} from "../storage/knowledge-writer";
import { unwrapData, extractTextFromParts, withTimeout } from "../utils/sdk-helpers";
import { fileExists, readTextFile } from "../utils/fs-compat";
import { displayExtractionResult } from "../display/feedback";
import { preprocessSessionSummary } from "../preprocessing/session-summary";

type ToolExecuteAfterInput = Parameters<NonNullable<Hooks["tool.execute.after"]>>[0];
type ToolExecuteAfterOutput = Parameters<NonNullable<Hooks["tool.execute.after"]>>[1];
type EventInput = Parameters<NonNullable<Hooks["event"]>>[0];

const sessionDebounceTimers = new Map<string, NodeJS.Timeout>();
const sessionToolCalls = new Map<string, ToolCallRecord[]>();
const sessionExtractionInProgress = new Map<string, boolean>();
const sessionToastShown = new Map<string, boolean>();

function getToolCalls(sessionID: string): ToolCallRecord[] {
  if (!sessionToolCalls.has(sessionID)) {
    sessionToolCalls.set(sessionID, []);
  }
  return sessionToolCalls.get(sessionID)!;
}

function parseModelConfig(modelString?: string): { providerID: string; modelID: string } | undefined {
  if (!modelString) return undefined;
  const [providerID, ...rest] = modelString.split('/');
  const modelID = rest.join('/');
  if (!providerID || !modelID) return undefined;
  return { providerID, modelID };
}

export interface ExtractionResult {
  modulesUpdated: number;
  sectionsAdded: number;
  indexUpdated: boolean;
}

export async function extractKnowledge(
  ctx: PluginInput, 
  sessionID: string,
  config?: PluginConfig
): Promise<ExtractionResult> {
  if (sessionExtractionInProgress.get(sessionID)) {
    console.log(`[smart-codebase] Extraction already in progress for session ${sessionID}, skipping`);
    return { modulesUpdated: 0, sectionsAdded: 0, indexUpdated: false };
  }

  sessionExtractionInProgress.set(sessionID, true);

  let extractionSessionID: string | undefined;
  const result: ExtractionResult = { modulesUpdated: 0, sectionsAdded: 0, indexUpdated: false };

  try {
     const toolCalls = sessionToolCalls.get(sessionID);

     if (!toolCalls || toolCalls.length === 0) {
       console.log(`[smart-codebase] No tool calls tracked in session ${sessionID}, skipping extraction`);
       return result;
     }

      const modifiedFiles = new Set(toolCalls.map(tc => tc.target).filter((t): t is string => !!t));
      
      console.log(`[smart-codebase] Knowledge extraction triggered for session ${sessionID}`);
      console.log(`[smart-codebase] Tool calls tracked (${toolCalls.length}), files involved (${modifiedFiles.size}):`, Array.from(modifiedFiles));

     const preprocessed = await preprocessSessionSummary(ctx, sessionID, toolCalls, {
       maxTokens: config?.extractionMaxTokens,
     });
     console.log(`[smart-codebase] Pre-processed summary: ${preprocessed.totalTokens} tokens${preprocessed.truncated ? ' (truncated)' : ''}`);

     const createResult = await ctx.client.session.create({
       body: {
         title: 'Knowledge Extraction',
         parentID: sessionID,
       }
     });

     if (createResult.error) {
       console.error('[smart-codebase] Failed to create extraction session:', createResult.error);
       return result;
     }

     extractionSessionID = createResult.data.id;
     console.log(`[smart-codebase] Created extraction session: ${extractionSessionID}`);
     
     // Show toast when subsession is created
     await ctx.client.tui.showToast({
       body: {
         title: "smart-codebase",
         message: "正在创建知识提取子会话，开始分析...",
         variant: "info",
         duration: 5000,
       },
     }).catch(() => {});

     const primaryFile = Array.from(modifiedFiles)[0];
     const primaryModulePath = getModulePath(primaryFile, ctx.directory);
     
     const existingSkillPath = join(ctx.directory, primaryModulePath, '.knowledge', 'SKILL.md');
     let existingSkillContent = '';
     if (await fileExists(existingSkillPath)) {
       existingSkillContent = await readTextFile(existingSkillPath);
       console.log(`[smart-codebase] Found existing SKILL.md at ${existingSkillPath}, will merge`);
     }

     const existingSkillSection = existingSkillContent 
       ? `\nEXISTING SKILL.md (merge with this):\n\`\`\`markdown\n${existingSkillContent}\n\`\`\`\n`
       : '\nNo existing SKILL.md found. Create new.\n';

     const systemContext = `You are smart-codebase: a knowledge distillation agent that writes/updates module-level SKILL.md files.

PRIMARY SIGNAL - CONVERSATION:
${preprocessed.conversation || '(No conversation)'}

SECONDARY SIGNALS:
- Files Modified: ${preprocessed.modifiedFiles || '(none)'}
- Git Diff: ${preprocessed.gitDiff || '(none)'}
- Tool Calls: ${preprocessed.toolCallsSummary || '(none)'}
- Code Snippets: ${preprocessed.codeSnippets || '(none)'}
${existingSkillSection}

YOUR TASK: Extract durable, project-specific knowledge for future AI sessions and Human developers.

EXTRACT when: implementation patterns, design decisions, gotchas, bug fixes with explanations, user-described features.
SKIP when: pure config changes, trivial edits (typos, formatting), no actionable knowledge.

MERGE with existing SKILL.md: preserve valuable content, update outdated info, add new sections, remove redundant content.

OUTPUT FORMAT:
{
  "skill": {
    "modulePath": "src/invoice",
    "name": "invoice-processing",
    "description": "发票表单验证。金额用 Decimal 避免精度问题，格式 INV-YYYYMMDD-XXXX。修改发票表单或校验逻辑时使用。",
    "sections": [{"heading": "表单验证", "content": "金额字段用 Decimal 类型避免精度问题。\\n发票号格式：INV-YYYYMMDD-XXXX"}],
    "relatedFiles": ["src/invoice/form.tsx"]
  }
}

RULES:
- name: lowercase-hyphens, max 64 chars. ALWAYS in English.
- description: Max 300 chars. Include: what it does + key knowledge/gotchas + "Use when..." trigger. This serves as the index summary for skill discovery. MUST be in user's language.
- sections: Complete merged list with heading + content.
- content: No verbose explanations. Be Concise.
- Language: Write description/headings/content in USER'S LANGUAGE (detect from conversation). Keep name field, code snippets, file paths, technical identifiers in English.
- relatedFiles: COMPLETE list after merging.
Return ONLY valid JSON. No knowledge: {"skill": null}`;

     const extractionPrompt = `Output the merged SKILL JSON now. Return ONLY valid JSON.`;

    const model = parseModelConfig(config?.extractionModel);
    console.log(`[smart-codebase] Sending extraction prompt to AI...${model ? ` (model: ${config?.extractionModel})` : ''}`);
    const promptResult = await withTimeout(
      ctx.client.session.prompt({
        path: { id: extractionSessionID },
        body: {
          ...(model && { model }),
          system: systemContext,
          parts: [{ type: 'text', text: extractionPrompt }]
        }
      }),
      120000
    );

    const response = unwrapData(promptResult as any) as { parts: any[] };
    const text = extractTextFromParts(response.parts);
    console.log(`[smart-codebase] Received AI response (${text.length} chars)`);

    let extracted: { skill: any } | null = null;
    try {
      let cleanText = text.trim();
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      extracted = JSON.parse(cleanText);
    } catch (error) {
      console.error('[smart-codebase] Failed to parse AI response as JSON:', error);
      return result;
    }

    if (!extracted?.skill) {
      console.log('[smart-codebase] No significant knowledge extracted');
      return result;
    }

    const s = extracted.skill;
    const modulePath = s.modulePath || '.';

    const skillContent: SkillContent = {
      metadata: {
        name: s.name || toSkillName(modulePath),
        description: s.description || `Handles ${modulePath} module. Use when working on related files.`
      },
      sections: (s.sections || []).map((sec: any) => ({
        heading: sec.heading,
        content: sec.content
      })),
      relatedFiles: s.relatedFiles || []
    };

    // Only write to module .knowledge/ if not root level
    // Root level knowledge goes directly to .opencode/skills/<project>/
    if (modulePath !== '.') {
      const skillPath = await writeModuleSkill(
        ctx.directory,
        modulePath,
        skillContent
      );
      console.log(`[smart-codebase] Updated module skill: ${skillPath}`);
      result.modulesUpdated = 1;
    } else {
      console.log(`[smart-codebase] Root-level knowledge, writing directly to OpenCode skill index`);
    }
    result.sectionsAdded = skillContent.sections.length;

    const indexEntry: IndexEntry = {
      name: skillContent.metadata.name,
      description: skillContent.metadata.description,
      location: modulePath === '.' 
        ? `.opencode/skills/${getProjectSkillName(ctx.directory)}/SKILL.md`
        : `modules/${toSkillName(modulePath)}.md`
    };

     await updateSkillIndex(ctx.directory, indexEntry);
     console.log(`[smart-codebase] Updated OpenCode skill index`);
     result.indexUpdated = true;

     sessionToolCalls.delete(sessionID);

     return result;
  } catch (error) {
    console.error(`[smart-codebase] Failed to extract knowledge for session ${sessionID}:`, error);
    return result;
  } finally {
    sessionExtractionInProgress.delete(sessionID);

    if (extractionSessionID) {
      try {
        await ctx.client.session.delete({
          path: { id: extractionSessionID }
        });
        console.log(`[smart-codebase] Cleaned up extraction session: ${extractionSessionID}`);
      } catch (error) {
        console.error(`[smart-codebase] Failed to cleanup extraction session:`, error);
      }
    }
  }
}

export function cancelPendingExtraction(sessionID: string): boolean {
  const timer = sessionDebounceTimers.get(sessionID);
  if (timer) {
    clearTimeout(timer);
    sessionDebounceTimers.delete(sessionID);
    console.log(`[smart-codebase] Cancelled pending extraction for session ${sessionID}`);
    return true;
  }
  return false;
}

export function createKnowledgeExtractorHook(ctx: PluginInput, config?: PluginConfig) {
  const toolExecuteAfter = async (
    input: ToolExecuteAfterInput,
    output: ToolExecuteAfterOutput,
  ) => {
    const toolName = input.tool.toLowerCase();

    // Filter out config and tui operations
    if (toolName.startsWith('config.') || toolName.startsWith('tui.')) {
      return;
    }

    // Skip tracking for extraction sessions (child sessions)
    // Extraction sessions have parentID set
    try {
      const session = await ctx.client.session.get({ path: { id: input.sessionID } });
      if (session.data?.parentID) {
        return; // Don't track tool calls from extraction sessions
      }
    } catch (error) {
      console.error(`[smart-codebase] Failed to check session parentID:`, error);
      return;
    }

    try {
      const target = output.title as string | undefined;
      const toolCalls = getToolCalls(input.sessionID);
      
      const record: ToolCallRecord = {
        tool: toolName,
        target,
        timestamp: Date.now()
      };
      
      toolCalls.push(record);
      console.log(`[smart-codebase] Tracked tool call: ${toolName}${target ? ` on ${target}` : ''}`);
    } catch (error) {
      console.error(`[smart-codebase] Failed to track tool call:`, error);
    }
  };

  const eventHandler = async ({ event }: EventInput) => {
    const props = event.properties as Record<string, unknown> | undefined;

    if (event.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined;
      if (!sessionID) return;

       if (config?.autoExtract === false) {
         // Check if we should show toast
         const toolCalls = sessionToolCalls.get(sessionID);
         if (toolCalls && toolCalls.length > 0 && !sessionToastShown.get(sessionID)) {
           await ctx.client.tui.showToast({
             body: {
               title: "smart-codebase",
               message: "可运行 /sc-extract 提取知识",
               variant: "info",
               duration: 5000,
             },
           }).catch(() => {});
           sessionToastShown.set(sessionID, true);
           console.log(`[smart-codebase] Toast notification triggered for session ${sessionID}`);
         }
         return;
       }

      const existingTimer = sessionDebounceTimers.get(sessionID);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const debounceMs = config?.debounceMs ?? 60000;
      
      await ctx.client.tui.showToast({
        body: {
          title: "smart-codebase",
          message: `会话空闲，${debounceMs / 1000}秒后开始知识提取...`,
          variant: "info",
          duration: 5000,
        },
      }).catch(() => {});
      console.log(`[smart-codebase] Countdown toast shown for session ${sessionID}`);
      
      const timer = setTimeout(async () => {
        const extractionResult = await extractKnowledge(ctx, sessionID, config);

        const message = displayExtractionResult(extractionResult);

        await ctx.client.tui.showToast({
          body: {
            title: "smart-codebase",
            message,
            variant: "success",
            duration: 5000,
          },
        }).catch(() => {});

        sessionDebounceTimers.delete(sessionID);
      }, debounceMs);

      sessionDebounceTimers.set(sessionID, timer);
      console.log(`[smart-codebase] Session ${sessionID} idle, extraction scheduled in ${debounceMs}ms`);
    }

     if (event.type === "session.deleted") {
        const sessionInfo = props?.info as { id?: string } | undefined;
        if (sessionInfo?.id) {
          const timer = sessionDebounceTimers.get(sessionInfo.id);
          if (timer) {
            clearTimeout(timer);
          }
          sessionDebounceTimers.delete(sessionInfo.id);
          sessionToolCalls.delete(sessionInfo.id);
          sessionToastShown.delete(sessionInfo.id);
          console.log(`[smart-codebase] Cleaned up session ${sessionInfo.id}`);
        }
      }
  };

  return {
    "tool.execute.after": toolExecuteAfter,
    event: eventHandler,
  };
}
