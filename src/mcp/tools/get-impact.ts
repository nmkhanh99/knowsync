import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';
import type { ImpactResult, SymbolInfo } from '../../types/index.js';

export const schema = {
  symbolName: z.string().describe('Name of the symbol that will change'),
  depth: z.number().int().min(1).max(5).default(2).describe('Levels of callers to traverse (default: 2)'),
};

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function getImpact(db: GraphDB, args: { symbolName: string; depth?: number }): ImpactResult {
  const depth = args.depth ?? 2;
  const symbols = db.getSymbolByName(args.symbolName);

  if (symbols.length === 0) {
    return { directlyAffected: [], transitivelyAffected: [], linkedDocs: [] };
  }

  const directlyAffected: SymbolInfo[] = [];
  const transitivelyAffected: SymbolInfo[] = [];
  const linkedDocs = db.getLinkedDocs(symbols[0].id);
  const directIds = new Set<string>();

  for (const symbol of symbols) {
    const direct = db.getCallers(symbol.id) as SymbolInfo[];
    for (const d of direct) {
      if (!directIds.has(d.id)) {
        directIds.add(d.id);
        directlyAffected.push(d);
      }
    }

    if (depth > 1) {
      const transitive = db.getTransitiveCallers(symbol.id, depth) as SymbolInfo[];
      for (const t of transitive) {
        if (!directIds.has(t.id)) {
          transitivelyAffected.push(t);
        }
      }
    }
  }

  return { directlyAffected, transitivelyAffected, linkedDocs };
}
