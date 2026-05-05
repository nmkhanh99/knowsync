import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';
import type { SymbolInfo } from '../../types/index.js';

export const schema = {
  moduleName: z.string().describe('Module name, file path (partial), or cluster ID'),
};

export interface ModuleOverview {
  moduleName: string;
  symbols: SymbolInfo[];
  symbolCount: number;
  fileCount: number;
  files: string[];
  topCalledSymbols: Array<{ symbol: SymbolInfo; callCount: number }>;
}

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function getModuleOverview(db: GraphDB, args: { moduleName: string }): ModuleOverview {
  const symbols = db.getSymbolsByModule(args.moduleName) as SymbolInfo[];
  const files = [...new Set(symbols.map((s) => s.filePath))];
  const topCalledSymbols = db.getTopCalledInModule(args.moduleName).map(({ node, callCount }) => ({
    symbol: node as SymbolInfo,
    callCount,
  }));

  return {
    moduleName: args.moduleName,
    symbols,
    symbolCount: symbols.length,
    fileCount: files.length,
    files,
    topCalledSymbols,
  };
}
