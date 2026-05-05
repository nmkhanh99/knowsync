import { resolve } from 'path';
import { loadRegistry, registerProject } from '../registry.js';
import { startVizServer } from '../../viz/server.js';

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export async function runViz(rootPath: string | undefined, port: number): Promise<void> {
  if (rootPath) {
    await registerProject(resolve(rootPath));
  }

  const registry = await loadRegistry();
  await startVizServer(registry.projects, port);
}
