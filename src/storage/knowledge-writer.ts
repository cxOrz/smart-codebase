import { mkdir } from 'fs/promises';
import { join, dirname, relative } from 'path';
import { fileExists, readTextFile, writeTextFile, sleep, removeFile } from '../utils/fs-compat';

export interface SkillMetadata {
  name: string;
  description: string;
}

export interface SkillContent {
  metadata: SkillMetadata;
  sections: SkillSection[];
  relatedFiles?: string[];
}

export interface SkillSection {
  heading: string;
  content: string;
}

export interface IndexEntry {
  name: string;
  description: string;
  location: string;
}

export async function writeModuleSkill(
  projectRoot: string,
  modulePath: string,
  skill: SkillContent
): Promise<string> {
  const knowledgeDir = join(projectRoot, modulePath, '.knowledge');
  const skillPath = join(knowledgeDir, 'SKILL.md');
  const lockFile = join(knowledgeDir, '.lock');

  await mkdir(knowledgeDir, { recursive: true });

  const lock = await acquireLock(lockFile, 5000);

  try {
    const content = formatSkillContent(skill);
    await writeTextFile(skillPath, content);
    return skillPath;
  } finally {
    await releaseLock(lock);
  }
}

function formatSkillContent(skill: SkillContent): string {
  const lines: string[] = [];

  lines.push('---');
  lines.push(`name: ${skill.metadata.name}`);
  lines.push(`description: ${skill.metadata.description}`);
  lines.push('---');
  lines.push('');

  for (const section of skill.sections) {
    lines.push(`## ${section.heading}`);
    lines.push('');
    lines.push(section.content);
    lines.push('');
  }

  if (skill.relatedFiles && skill.relatedFiles.length > 0) {
    lines.push('## Related files');
    lines.push('');
    for (const file of skill.relatedFiles) {
      lines.push(`- \`${file}\``);
    }
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}

export async function updateGlobalIndex(
  projectRoot: string,
  entry: IndexEntry
): Promise<void> {
  const indexPath = join(projectRoot, '.knowledge', 'KNOWLEDGE.md');
  const lockFile = join(projectRoot, '.knowledge.lock');

  const lock = await acquireLock(lockFile, 5000);

  try {
    let content = '';
    if (await fileExists(indexPath)) {
      content = await readTextFile(indexPath);
    }

    if (!content.includes('# Project Knowledge')) {
      content = `# Project Knowledge

> Project knowledge index. Read this first to understand available domain knowledge, then read relevant module SKILLs as needed.

`;
    }

    const entryMarker = `### ${entry.name}`;
    if (content.includes(entryMarker)) {
      const entryRegex = new RegExp(
        `### ${escapeRegex(entry.name)}[\\s\\S]*?(?=\\n### |$)`,
        'g'
      );
      content = content.replace(entryRegex, formatIndexEntry(entry));
    } else {
      content = content.trimEnd() + '\n\n' + formatIndexEntry(entry);
    }

    await writeTextFile(indexPath, content);
  } finally {
    await releaseLock(lock);
  }
}

function formatIndexEntry(entry: IndexEntry): string {
  return `### ${entry.name}
${entry.description}
- **Location**: \`${entry.location}\`
`;
}

export function toSkillName(modulePath: string): string {
  if (modulePath === '.') return 'project-root';
  
  return modulePath
    .replace(/[\/\\]/g, '-')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase()
    .slice(0, 64);
}

export function getModulePath(filePath: string, projectRoot: string): string {
  const relativePath = relative(projectRoot, dirname(filePath));
  const parts = relativePath.split('/').filter(p => p && p !== '.');

  if (parts.length === 0) return '.';
  if (parts.length === 1) return parts[0];

  return parts.slice(0, 2).join('/');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function acquireLock(lockFile: string, timeoutMs: number): Promise<{ file: string }> {
  const startTime = Date.now();
  const dir = dirname(lockFile);

  await mkdir(dir, { recursive: true });

  while (true) {
    try {
      if (await fileExists(lockFile)) {
        throw { code: 'EEXIST' };
      }
      await writeTextFile(lockFile, process.pid.toString());
      return { file: lockFile };
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        if (Date.now() - startTime > timeoutMs) {
          throw new Error(`Failed to acquire lock on ${lockFile} within ${timeoutMs}ms`);
        }
        await sleep(50);
        continue;
      }
      throw error;
    }
  }
}

async function releaseLock(lock: { file: string }): Promise<void> {
  try {
    if (await fileExists(lock.file)) {
      await removeFile(lock.file);
    }
  } catch (error) {
    console.error(`Failed to release lock ${lock.file}:`, error);
  }
}
