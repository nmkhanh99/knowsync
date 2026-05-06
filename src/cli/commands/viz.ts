import { resolve } from 'path';
import { loadRegistry, registerProject } from '../registry.js';
import { startVizServer } from '../../viz/server.js';

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export async function runViz(projectDir: string | undefined, port: number): Promise<void> {
  if (projectDir) {
    await registerProject(resolve(projectDir), [], undefined, undefined, [], undefined);
  }

  const registry = await loadRegistry();
  await startVizServer(registry.projects, port);
}
