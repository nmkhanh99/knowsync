import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';
import type { DocSection } from '../../types/index.js';

export const schema = {
  symbolOrFlow: z.string().describe('Symbol name or flow name to find linked documentation for'),
};

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function getLinkedDocs(db: GraphDB, args: { symbolOrFlow: string }): DocSection[] {
  const symbols = db.getSymbolByName(args.symbolOrFlow);
  if (symbols.length === 0) return [];

  const docs: DocSection[] = [];
  for (const symbol of symbols) {
    docs.push(...db.getLinkedDocs(symbol.id));
  }
  return docs;
}
