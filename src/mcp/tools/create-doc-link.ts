import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';

export const schema = {
  docSectionId: z.string().describe('ID of the DocSection to link from'),
  symbolName: z.string().describe('Name of the Symbol to link to'),
};

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function createDocLink(
  db: GraphDB,
  args: { docSectionId: string; symbolName: string },
): { ok: boolean; edgeId?: string; error?: string } {
  const section = db.getDocSectionById(args.docSectionId);
  if (!section) return { ok: false, error: `DocSection "${args.docSectionId}" not found` };

  const symbols = db.getSymbolByName(args.symbolName);
  if (!symbols.length) return { ok: false, error: `Symbol "${args.symbolName}" not found` };

  const sym = symbols[0];
  const edgeId = `${section.id}->REFERENCES->${sym.id}`;

  if (db.hasEdge(section.id, sym.id)) {
    return { ok: true, edgeId, error: 'Link already exists' };
  }

  db.createManualEdge({ id: edgeId, type: 'REFERENCES', sourceId: section.id, targetId: sym.id });
  return { ok: true, edgeId };
}
