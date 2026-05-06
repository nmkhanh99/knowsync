import { resolve } from 'path';
import { loadConfig } from '../config.js';
import { loadRegistry, registerProject, CENTRAL_DB_PATH } from '../registry.js';
import { GraphDB } from '../../graph/db.js';
import { runIndex } from '../../indexer/index.js';
import type { CodeSourceConfig, DocSourceConfig } from '../../types/index.js';
import type { RegisteredProject } from '../registry.js';

export interface IndexCommandOptions {
  docs: boolean;
  delta: boolean;
  all: boolean;
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export async function runIndexCommand(projectDir: string | undefined, opts: IndexCommandOptions): Promise<void> {
  if (opts.all) {
    await indexAllProjects(opts);
    return;
  }
  const absRoot = resolve(projectDir ?? '.');
  await indexOne(absRoot, opts);
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
async function indexOne(absRoot: string, opts: { docs: boolean; delta: boolean }): Promise<void> {
  const config = await loadConfig(absRoot);
  const entry = await registerProject(absRoot);

  const db = new GraphDB(CENTRAL_DB_PATH, entry.id);
  await db.init();

  const docSources: DocSourceConfig[] | undefined =
    entry.docSources?.length ? entry.docSources : undefined;
  const codeSources: CodeSourceConfig[] | undefined =
    entry.codeSources?.length ? entry.codeSources : undefined;

  await runIndex(db, {
    includeDocs: opts.docs,
    delta: opts.delta,
    languages: config.languages,
    codeSources,
    docSources,
  });
  db.close();
}

async function indexRegisteredProject(project: RegisteredProject, opts: { docs: boolean; delta: boolean }): Promise<void> {
  const db = new GraphDB(CENTRAL_DB_PATH, project.id);
  await db.init();
  await runIndex(db, {
    includeDocs: opts.docs,
    delta: opts.delta,
    codeSources: project.codeSources?.length ? project.codeSources : undefined,
    docSources: project.docSources?.length ? project.docSources : undefined,
  });
  db.close();
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
async function indexAllProjects(opts: { docs: boolean; delta: boolean }): Promise<void> {
  const registry = await loadRegistry();
  if (registry.projects.length === 0) {
    console.log('No registered projects. Run: knowsync register <path>');
    return;
  }

  for (const project of registry.projects) {
    console.log(`\n── ${project.name}`);
    await indexRegisteredProject(project, opts);
  }
  console.log('\nAll projects indexed.');
}
