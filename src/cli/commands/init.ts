import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { KnowSyncConfig } from '../../types/index.js';

/**
 * Auto-documented structural element.
 */
export async function runInit(projectDir: string): Promise<void> {
  const configPath = join(projectDir, 'knowsync.config.json');

  if (existsSync(configPath)) {
    console.log('knowsync.config.json already exists. Skipping init.');
    return;
  }

  const config: KnowSyncConfig = {
    include: ['src/**/*', 'lib/**/*'],
    exclude: ['node_modules', 'dist', '*.test.*', '*.spec.*'],
    languages: ['typescript', 'javascript', 'python'],
    docsGlob: 'docs/**/*.md',
    docSources: [],  // Set doc sources via: knowsync register --docs-source <path>
    groupDocsBy: 'by-file',
    visualDocs: {
      structureMode: 'file',
      folderDepth: 2,
    },
  };

  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log('Created knowsync.config.json');

  // Install git hook
  const hookDir = join(projectDir, '.git', 'hooks');
  if (existsSync(join(projectDir, '.git'))) {
    await mkdir(hookDir, { recursive: true });
    const hookContent = `#!/bin/sh\nnpx knowsync index . --docs --delta >/dev/null 2>&1 || true\n`;
    const hookPath = join(hookDir, 'post-commit');
    await writeFile(hookPath, hookContent, { mode: 0o755 });
    console.log('Installed git post-commit hook');
  }

  console.log('\nKnowSync initialized. Run: npx knowsync index . --docs');
}
