import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';

export const schema = {};

export interface ValidateLinksResult {
  staleLinks: Array<{ edgeId: string; docFile: string; docHeading: string; missingSymbolId: string }>;
  totalLinks: number;
  staleCount: number;
}

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function validateLinks(db: GraphDB, _args: Record<string, never>): ValidateLinksResult {
  const stale = db.getStaleDocLinks();
  return {
    staleLinks: stale.map((s) => ({
      edgeId: s.edgeId,
      docFile: s.docSection.filePath,
      docHeading: s.docSection.heading,
      missingSymbolId: s.missingSymbolId,
    })),
    totalLinks: db.getDocLinkCount(),
    staleCount: stale.length,
  };
}
