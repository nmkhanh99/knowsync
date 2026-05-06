import { resolve } from 'path';
import { loadConfig } from '../config.js';
import { loadRegistry, registerProject, unregisterProject } from '../registry.js';
import type { DocSourceConfig, VisualDocsConfig } from '../../types/index.js';

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export async function runRegister(
  projectDir: string,
  opts: { docSources?: string[]; code?: string } = {},
): Promise<void> {
  const absRoot = resolve(projectDir);
  const config = await loadConfig(absRoot).catch(() => ({
    docSources: [] as DocSourceConfig[],
    visualDocs: { structureMode: 'file', folderDepth: 2 } as VisualDocsConfig,
  }));

  const docSources: DocSourceConfig[] = opts.docSources?.length
    ? opts.docSources.map((p) => ({ path: p }))
    : (config.docSources ?? []);

  const visualDocs: VisualDocsConfig | undefined = config.visualDocs;
  const project = await registerProject(absRoot, docSources, visualDocs, undefined, undefined, opts.code);
  console.log(`Registered: ${project.name} [${project.id}]${project.code ? ` (Code: ${project.code})` : ''}`);
  if (project.docSources.length) {
    console.log(`  Doc sources:`);
    for (const s of project.docSources) {
      console.log(`    ${s.path}${s.label ? `  (${s.label})` : ''}`);
    }
  }
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export async function runUnregister(id: string): Promise<void> {
  const removed = await unregisterProject(id);
  if (removed) {
    console.log(`Unregistered: ${id}`);
  } else {
    console.error(`Project not found: ${id}`);
    process.exit(1);
  }
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export async function runList(): Promise<void> {
  const registry = await loadRegistry();
  if (registry.projects.length === 0) {
    console.log('No projects registered. Run: knowsync register <path>');
    return;
  }
  console.log(`\nRegistered projects (${registry.projects.length}):\n`);
  for (const p of registry.projects) {
    const date = new Date(p.registeredAt).toLocaleDateString('vi-VN');
    console.log(`  [${p.id}]  ${p.name}${p.code ? ` (Code: ${p.code})` : ''}`);
    if (p.codeSources?.length) {
      console.log(`           code: ${p.codeSources.map((s) => s.path).join(', ')}`);
    }
    if (p.docSources?.length) {
      console.log(`           docs: ${p.docSources.map((s) => s.path).join(', ')}`);
    }
    console.log(`           Registered: ${date}\n`);
  }
}
