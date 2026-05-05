import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';

export const schema = {
  symbolName: z.string().describe('Name of the symbol to get full context for'),
  depth: z.number().optional().describe('Call depth for transitive callers/callees (default 2)'),
};

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function getFullContext(db: GraphDB, args: { symbolName: string; depth?: number }) {
  const depth = Math.min(args.depth ?? 2, 5);
  const symbols = db.getSymbolByName(args.symbolName);
  if (!symbols.length) return null;

  const sym = symbols[0];
  const directCallers = db.getCallers(sym.id);
  const directCallees = db.getCallees(sym.id, 1).map(c => c.node);
  const transitiveCallers = db.getTransitiveCallers(sym.id, depth);
  const linkedDocs = db.getLinkedDocs(sym.id);
  const linkedRequirements = db.getRequirementsForSymbol(sym.id);
  const moduleSymbols = db.getSymbolsByModule(sym.filePath).filter(s => s.id !== sym.id).slice(0, 20);

  return {
    symbol: sym,
    directCallers,
    directCallees,
    transitiveCallers,
    linkedDocs,
    linkedRequirements,
    moduleSymbols,
    summary: {
      callerCount: transitiveCallers.length,
      calleeCount: directCallees.length,
      docCount: linkedDocs.length,
      requirementCount: linkedRequirements.length,
    },
  };
}
