import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';
import type { SymbolInfo, DocSection } from '../../types/index.js';

export const schema = {
  query: z.string().describe('Search query — symbol name, partial name, or keyword'),
  nodeTypes: z.array(z.string()).optional().describe('Filter by node types (Function, Class, DocSection, ...)'),
  limit: z.number().int().min(1).max(50).default(20).describe('Max results (default: 20)'),
};

export interface SearchResult {
  symbols: SymbolInfo[];
  docs: DocSection[];
}

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function searchGraph(db: GraphDB, args: { query: string; nodeTypes?: string[]; limit?: number }): SearchResult {
  const limit = args.limit ?? 20;

  let symbols = db.searchSymbols(args.query, limit) as SymbolInfo[];
  if (args.nodeTypes && args.nodeTypes.length > 0) {
    symbols = symbols.filter((s) => args.nodeTypes!.includes(s.type));
  }

  const docs = db.searchDocs(args.query, limit);
  return { symbols, docs };
}
