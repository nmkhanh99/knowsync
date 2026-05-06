import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { KnowSyncConfig } from '../types/index.js';

const DEFAULTS: KnowSyncConfig = {
  include: ['src/**/*'],
  exclude: ['node_modules', 'dist'],
  languages: ['typescript', 'javascript', 'python'],
  docsGlob: 'docs/**/*.md',
  docSources: [],
  visualDocs: {
    structureMode: 'file',
    folderDepth: 2,
  },
};

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export async function loadConfig(projectDir: string): Promise<KnowSyncConfig> {
  const configPath = join(projectDir, 'knowsync.config.json');
  if (!existsSync(configPath)) return { ...DEFAULTS };

  const raw = await readFile(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<KnowSyncConfig> & { groupDocsBy?: string };
  const groupDocsBy = parsed.groupDocsBy;
  const structureMode = groupDocsBy === 'by-folder'
    ? 'folder'
    : groupDocsBy === 'by-doc-source'
      ? 'docSource'
      : groupDocsBy === 'flat'
        ? 'flat'
        : groupDocsBy === 'by-file'
          ? 'file'
          : (parsed.visualDocs?.structureMode ?? DEFAULTS.visualDocs.structureMode);
  return {
    ...DEFAULTS,
    ...parsed,
    visualDocs: {
      ...DEFAULTS.visualDocs,
      ...(parsed.visualDocs ?? {}),
      structureMode,
    },
  };
}
