/**
 * Knowledge extraction hook for smart-codebase plugin
 * Monitors session idle events and extracts knowledge from completed tasks
 */

import type { PluginInput, Hooks } from "@opencode-ai/plugin";
import type { PluginConfig, Fact } from "../types";
import { appendFact } from "../storage/knowledge-writer";
import { getKnowledgeDirectory } from "../storage/knowledge-writer";
import { linkFact } from "../linking/knowledge-linker";
import { unwrapData, extractTextFromParts, withTimeout } from "../utils/sdk-helpers";

type ToolExecuteAfterInput = Parameters<NonNullable<Hooks["tool.execute.after"]>>[0];
type ToolExecuteAfterOutput = Parameters<NonNullable<Hooks["tool.execute.after"]>>[1];
type EventInput = Parameters<NonNullable<Hooks["event"]>>[0];

/**
 * Creates the knowledge extraction hook
 * 
 * Implements:
 * - event hook for session.idle (with 30s debounce)
 * - event hook for session.deleted (cleanup)
 * - tool.execute.after hook for tracking file modifications
 * 
 * @param ctx - Plugin input context
 * @param config - Plugin configuration
 * @returns Hook handlers object
 */
export function createKnowledgeExtractorHook(ctx: PluginInput, config?: PluginConfig) {
  // Session state: Map<sessionID, debounceTimeout>
  const sessionDebounceTimers = new Map<string, NodeJS.Timeout>();
  
  // Session state: Map<sessionID, Set<filePath>>
  // Tracks which files were modified in each session
  const sessionModifiedFiles = new Map<string, Set<string>>();

  /**
   * Gets or creates the modified files set for a session
   */
  function getModifiedFiles(sessionID: string): Set<string> {
    if (!sessionModifiedFiles.has(sessionID)) {
      sessionModifiedFiles.set(sessionID, new Set<string>());
    }
    return sessionModifiedFiles.get(sessionID)!;
  }

  /**
   * Extracts knowledge from a session using AI analysis
   * 
   * Creates a sub-session to analyze modified files and extract structured facts.
   * Each fact is stored and linked to related knowledge.
   * 
   * @param ctx - Plugin input context
   * @param sessionID - Session identifier
   */
  async function extractKnowledge(ctx: PluginInput, sessionID: string): Promise<void> {
    let extractionSessionID: string | undefined;
    
    try {
      const modifiedFiles = sessionModifiedFiles.get(sessionID);
      
      // No files modified - nothing to extract
      if (!modifiedFiles || modifiedFiles.size === 0) {
        console.log(`[smart-codebase] No files modified in session ${sessionID}, skipping extraction`);
        return;
      }

      console.log(`[smart-codebase] Knowledge extraction triggered for session ${sessionID}`);
      console.log(`[smart-codebase] Modified files (${modifiedFiles.size}):`, Array.from(modifiedFiles));

      // 1. Create extraction sub-session
      const createResult = await ctx.client.session.create({
        body: {
          title: 'Knowledge Extraction',
          parentID: sessionID,
        }
      });
      const sessionData = unwrapData(createResult as any) as { id: string };
      extractionSessionID = sessionData.id;
      console.log(`[smart-codebase] Created extraction session: ${extractionSessionID}`);

      // 2. Build extraction prompt
      const modifiedFilesList = Array.from(modifiedFiles)
        .slice(0, 20) // Limit to first 20 files
        .map(f => `- ${f}`)
        .join('\n');

      const extractionPrompt = `You are analyzing code changes from a completed task. Based on the following modified files, extract key learnings as structured knowledge.

Modified files:
${modifiedFilesList}

Extract facts about:
1. Patterns or conventions discovered
2. Important gotchas or notes to remember  
3. Relationships between files/modules

Return a JSON array of facts. Each fact must have:
- id: unique UUID (generate one for each fact)
- subject: topic name (e.g., "Order Status Flow")
- fact: the knowledge content (1-3 sentences)
- citations: array of file paths that relate to this fact
- importance: "high", "medium", or "low"
- keywords: array of relevant keywords for search

Return ONLY valid JSON array, no markdown code blocks or explanation.
Example:
[{"id":"abc123","subject":"Auth Pattern","fact":"JWT tokens stored in httpOnly cookies","citations":["src/auth.ts"],"importance":"high","keywords":["auth","jwt","cookie"]}]

If no significant learnings, return empty array: []`;

      // 3. Call AI with timeout
      console.log(`[smart-codebase] Sending extraction prompt to AI...`);
      const promptResult = await withTimeout(
        ctx.client.session.prompt({
          path: { id: extractionSessionID },
          body: {
            parts: [{ type: 'text', text: extractionPrompt }]
          }
        }),
        60000 // 60s timeout
      );

      // 4. Extract and parse response
      const response = unwrapData(promptResult as any) as { parts: any[] };
      const text = extractTextFromParts(response.parts);
      console.log(`[smart-codebase] Received AI response (${text.length} chars)`);

      let facts: unknown[] = [];
      try {
        // Remove markdown code blocks if present
        let cleanText = text.trim();
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        }
        facts = JSON.parse(cleanText);
      } catch (error) {
        console.error('[smart-codebase] Failed to parse AI response as JSON:', error);
        return;
      }

      if (!Array.isArray(facts)) {
        console.error('[smart-codebase] AI response is not an array');
        return;
      }

      console.log(`[smart-codebase] Parsed ${facts.length} facts from AI response`);

      // 5. Validate and store each fact
      let storedCount = 0;
      for (const factData of facts) {
        if (!isValidFact(factData)) {
          console.warn('[smart-codebase] Skipping invalid fact:', factData);
          continue;
        }

        // Add required fields
        const fact: Fact = {
          ...factData,
          timestamp: new Date().toISOString(),
          learned_from: `Session ${sessionID}`,
        };

        try {
          // 6. Store fact
          await appendFact(ctx.directory, fact);
          
          // 7. Link fact
          await linkFact(fact, ctx.directory);
          
          storedCount++;
          console.log(`[smart-codebase] Stored and linked fact: ${fact.subject}`);
        } catch (error) {
          console.error(`[smart-codebase] Failed to store/link fact ${fact.id}:`, error);
          // Continue with next fact
        }
      }

      console.log(`[smart-codebase] Successfully stored ${storedCount}/${facts.length} facts`);

      // Clear modified files after extraction
      sessionModifiedFiles.delete(sessionID);
    } catch (error) {
      console.error(`[smart-codebase] Failed to extract knowledge for session ${sessionID}:`, error);
    } finally {
      // 8. Always cleanup: delete extraction session
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

  /**
   * Validates that an object has all required Fact fields
   * 
   * @param obj - Object to validate
   * @returns True if object is a valid Fact
   */
  function isValidFact(obj: unknown): obj is Fact {
    if (typeof obj !== 'object' || obj === null) return false;
    const fact = obj as Record<string, unknown>;
    
    return (
      typeof fact.id === 'string' &&
      typeof fact.subject === 'string' &&
      typeof fact.fact === 'string' &&
      Array.isArray(fact.citations) &&
      Array.isArray(fact.keywords) &&
      ['high', 'medium', 'low'].includes(fact.importance as string)
    );
  }

  /**
   * Tool execution after hook
   * Tracks file modifications from Write and Edit tools
   */
  const toolExecuteAfter = async (
    input: ToolExecuteAfterInput,
    output: ToolExecuteAfterOutput,
  ) => {
    const toolName = input.tool.toLowerCase();

    // Track Write and Edit tool executions
    if (toolName === "write" || toolName === "edit") {
      try {
        // Extract file path from output.title
        // Both Write and Edit tools set title to the file path
        const filePath = output.title;

        if (filePath) {
          const modifiedFiles = getModifiedFiles(input.sessionID);
          modifiedFiles.add(filePath);
          console.log(`[smart-codebase] Tracked file modification: ${filePath} in session ${input.sessionID}`);
        }
      } catch (error) {
        console.error(`[smart-codebase] Failed to track file modification:`, error);
      }
    }
  };

  /**
   * Event handler
   * Handles session.idle and session.deleted events
   */
  const eventHandler = async ({ event }: EventInput) => {
    const props = event.properties as Record<string, unknown> | undefined;

    // Handle session.idle event with debounce
    if (event.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined;
      if (!sessionID) return;

      // Check if auto-extraction is enabled
      if (config?.autoExtract === false) {
        return;
      }

      // Clear previous debounce timer
      const existingTimer = sessionDebounceTimers.get(sessionID);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new debounce timer (default: 30 seconds)
      const debounceMs = config?.debounceMs ?? 30000;
      const timer = setTimeout(async () => {
        await extractKnowledge(ctx, sessionID);
        sessionDebounceTimers.delete(sessionID);
      }, debounceMs);

      sessionDebounceTimers.set(sessionID, timer);
      console.log(`[smart-codebase] Session ${sessionID} idle, extraction scheduled in ${debounceMs}ms`);
    }

    // Handle session.deleted event - cleanup
    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined;
      if (sessionInfo?.id) {
        const timer = sessionDebounceTimers.get(sessionInfo.id);
        if (timer) {
          clearTimeout(timer);
        }
        sessionDebounceTimers.delete(sessionInfo.id);
        sessionModifiedFiles.delete(sessionInfo.id);
        console.log(`[smart-codebase] Cleaned up session ${sessionInfo.id}`);
      }
    }
  };

  return {
    "tool.execute.after": toolExecuteAfter,
    event: eventHandler,
  };
}
