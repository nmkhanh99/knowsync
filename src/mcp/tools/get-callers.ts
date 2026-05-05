import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';
import type { SymbolInfo } from '../../types/index.js';

export const schema = {
  functionName: z.string().describe('Name of the function to find callers for'),
};

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function getCallers(db: GraphDB, args: { functionName: string }): SymbolInfo[] {
  const symbols = db.getSymbolByName(args.functionName);
  if (symbols.length === 0) return [];

  const callers: SymbolInfo[] = [];
  for (const symbol of symbols) {
    callers.push(...(db.getCallers(symbol.id) as SymbolInfo[]));
  }
  return callers;
}
