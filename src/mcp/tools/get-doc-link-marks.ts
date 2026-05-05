import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';

export const schema = {
  onlyUnresolved: z.boolean().optional()
    .describe('Return only unresolved marks (default true). Set false to include already-resolved marks.'),
};

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function getDocLinkMarks(db: GraphDB, args: { onlyUnresolved?: boolean }) {
  const marks = db.getDocLinkMarks(args.onlyUnresolved ?? true);
  return {
    total: marks.length,
    marks,
    hint: marks.length
      ? [
          'Each mark records a manual link or unlink action that needs to be reflected in source files.',
          'markType="doc_symbol" with action="link" → add @symbolName or [[symbolName]] to the doc section markdown.',
          'markType="doc_symbol" with action="unlink" → remove @symbolName / [[symbolName]] from the doc section markdown.',
          'markType="doc_doc" with action="link" → add annotationText or wikiAnnotationText to the source doc section markdown.',
          'Call knowsync_resolve_doc_link_mark after updating the source file.',
        ].join(' ')
      : 'No pending marks.',
  };
}
