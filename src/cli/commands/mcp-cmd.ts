import { resolve } from 'path';
import { GraphDB } from '../../graph/db.js';
import { startMcpServer } from '../../mcp/server.js';
import { registerProject, CENTRAL_DB_PATH } from '../registry.js';

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export async function runMcpCommand(rootPath: string): Promise<void> {
  const absRoot = resolve(rootPath);
  const entry = await registerProject(absRoot);

  const db = new GraphDB(CENTRAL_DB_PATH, entry.id);
  await db.init();

  await startMcpServer(db, absRoot, entry);
}
