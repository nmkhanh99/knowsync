import { startMcpServer } from '../../mcp/server.js';
import { loadRegistry, CENTRAL_DB_PATH } from '../registry.js';

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export async function runMcpCommand(): Promise<void> {
  const registry = await loadRegistry();
  await startMcpServer(CENTRAL_DB_PATH, registry.projects, registry.projects[0]?.id);
}
