import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';

export const schema = {
  markId: z.string().describe('ID of the doc link mark to resolve (from knowsync_get_doc_link_marks)'),
};

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function resolveDocLinkMark(db: GraphDB, args: { markId: string }) {
  const ok = db.resolveDocLinkMark(args.markId);
  return { resolved: ok, markId: args.markId };
}
