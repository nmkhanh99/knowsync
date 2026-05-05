import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';
import type { DocSyncResult, SymbolInfo } from '../../types/index.js';

export const schema = {
  symbolName: z.string().describe('Symbol name to check documentation sync status'),
};

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function checkDocSync(db: GraphDB, args: { symbolName: string }): DocSyncResult | null {
  const symbols = db.getSymbolByName(args.symbolName);
  if (symbols.length === 0) return null;

  const symbol = symbols[0] as SymbolInfo;
  const linkedDocs = db.getLinkedDocs(symbol.id);
  const issues: string[] = [];

  if (linkedDocs.length === 0) {
    issues.push(`No documentation found for symbol "${args.symbolName}"`);
  }
  if (!symbol.docString) {
    issues.push(`Symbol "${args.symbolName}" has no inline doc comment`);
  }

  return {
    symbol,
    linkedDocs,
    isSynced: issues.length === 0,
    issues,
  };
}
