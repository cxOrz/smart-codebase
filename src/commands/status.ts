import { tool } from "@opencode-ai/plugin";
import { join } from "path";
import type { KnowledgeStats } from "../types";
import { fileExists, findFiles } from "../utils/fs-compat";

export const statusCommand = tool({
  description: "Display smart-codebase knowledge base status",
  args: {},
  async execute(_input, ctx) {
    try {
      const stats = await getKnowledgeStats(ctx.directory);
      
      const indexStatus = stats.hasGlobalIndex ? '✅ exists' : '❌ not created';
      const moduleList = stats.modules.length > 0 
        ? stats.modules.map(m => `  - ${m}`).join('\n')
        : '  (none)';
      
      return `📚 smart-codebase Knowledge Status

Global index (.knowledge/KNOWLEDGE.md): ${indexStatus}
Module count: ${stats.moduleCount}

Modules with knowledge:
${moduleList}`;
      
    } catch (error) {
      console.error('[smart-codebase] Status command failed:', error);
      return `❌ Failed to get status: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

async function getKnowledgeStats(projectRoot: string): Promise<KnowledgeStats> {
  const indexPath = join(projectRoot, '.knowledge', 'KNOWLEDGE.md');
  const hasGlobalIndex = await fileExists(indexPath);
  
  const skillFiles = await findFiles('**/.knowledge/SKILL.md', {
    cwd: projectRoot,
    absolute: false,
  });
  
  const modules = skillFiles.map(f => f.replace('/.knowledge/SKILL.md', ''));
  
  return {
    hasGlobalIndex,
    moduleCount: modules.length,
    modules,
  };
}
