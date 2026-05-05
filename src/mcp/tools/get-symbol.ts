import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';
import type { SymbolInfo } from '../../types/index.js';

export const schema = {
  symbolName: z.string().describe('Name of the symbol (function, class, type, variable)'),
  filePath: z.string().optional().describe('Optional: filter by file path'),
};

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function getSymbol(db: GraphDB, args: { symbolName: string; filePath?: string }): SymbolInfo[] {
  return db.getSymbolByName(args.symbolName, args.filePath) as SymbolInfo[];
}
