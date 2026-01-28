import { tool } from "@opencode-ai/plugin";
import { join, dirname } from "path";
import { findFiles, readTextFile, writeTextFile } from "../utils/fs-compat";

export const rebuildIndexCommand = tool({
  description: "Rebuild global knowledge base index from all SKILL.md files",
  args: {},
  async execute(_input, ctx) {
    try {
      const skillFiles = await findFiles('**/.knowledge/SKILL.md', {
        cwd: ctx.directory,
        absolute: true,
      });
      
      if (skillFiles.length === 0) {
        return `📭 No module knowledge files found (.knowledge/SKILL.md)`;
      }
      
      const entries: string[] = [];
      
      for (const skillPath of skillFiles) {
        try {
          const content = await readTextFile(skillPath);
          const modulePath = dirname(dirname(skillPath)).replace(ctx.directory + '/', '');
          
          const nameMatch = content.match(/^name:\s*(.+)$/m);
          const name = nameMatch ? nameMatch[1].trim() : modulePath;
          
          const descMatch = content.match(/^description:\s*(.+)$/m);
          const description = descMatch ? descMatch[1].trim() : `Handles ${name} module.`;
          
          entries.push(`### ${name}
${description}
- **Location**: \`${modulePath}/.knowledge/SKILL.md\`
`);
        } catch (error) {
          console.warn(`[smart-codebase] Failed to parse ${skillPath}:`, error);
        }
      }
      
      const indexContent = `# Project Knowledge

> Project knowledge index. Read this first to understand available domain knowledge, then read relevant module SKILLs as needed.

${entries.join('\n')}`;
      
      const indexPath = join(ctx.directory, '.knowledge', 'KNOWLEDGE.md');
      await writeTextFile(indexPath, indexContent);
      
      return `🔄 Knowledge index rebuilt

Scanned modules: ${skillFiles.length}
Successfully parsed: ${entries.length}
Index location: .knowledge/KNOWLEDGE.md`;
      
    } catch (error) {
      console.error('[smart-codebase] Rebuild index command failed:', error);
      return `❌ Rebuild failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
