import { basename } from "path";

export function toSkillName(modulePath: string): string {
  if (modulePath === '.') return 'project-root';

  return modulePath
    .replace(/[\/\\]/g, '-')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase()
    .slice(0, 64);
}

export function getProjectSkillName(projectRoot: string): string {
  const folderName = basename(projectRoot);

  return folderName
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 64) || 'project';
}
