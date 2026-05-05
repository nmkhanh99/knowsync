import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';
import type { ProcessFlow, SymbolInfo } from '../../types/index.js';

export const schema = {
  entryPoint: z.string().describe('Name of the entry point function or method'),
  maxDepth: z.number().int().min(1).max(10).default(5).describe('Max call depth to trace (default: 5)'),
};

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function getProcessFlow(db: GraphDB, args: { entryPoint: string; maxDepth?: number }): ProcessFlow | null {
  const maxDepth = args.maxDepth ?? 5;
  const symbols = db.getSymbolByName(args.entryPoint);
  if (symbols.length === 0) return null;

  const entryPoint = symbols[0] as SymbolInfo;
  const callees = db.getCallees(entryPoint.id, maxDepth);

  return {
    entryPoint,
    steps: callees.map(({ node, depth }) => ({
      symbol: node as SymbolInfo,
      callDepth: depth,
      callEdgeType: 'CALLS' as const,
    })),
  };
}
