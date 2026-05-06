import type { GraphDB } from '../../graph/db.js';

export const schema = {};

/**
 * MCP Tool Handler.
 * Returns baseline graph/runtime counts for the active project without direct DB access.
 */
export function getGraphStats(db: GraphDB) {
  return db.getGraphStats();
}
