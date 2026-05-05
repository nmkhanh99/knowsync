import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';
import type { DocSection, GraphNode } from '../../types/index.js';

export const schema = {
  docSectionId: z.string().optional().describe('ID of a DocSection to find link suggestions for'),
  symbolName: z.string().optional().describe('Symbol name — find DocSections that mention it but are not linked'),
};

const IDENTIFIER_RE = /\b([A-Za-z_$][A-Za-z0-9_$]{2,})\b/g;
const CODE_SPAN_SYMBOL_RE = /`([A-Za-z_$][\w$]*)`/g;

export interface LinkSuggestion {
  docSection: DocSection;
  symbol: GraphNode;
  reason: string;
  alreadyLinked: boolean;
}

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function suggestDocLinks(
  db: GraphDB,
  args: { docSectionId?: string; symbolName?: string },
): LinkSuggestion[] | null {
  if (args.docSectionId) {
    const section = db.getDocSectionById(args.docSectionId);
    if (!section) return null;

    const headingCandidates = collectCandidates(section.heading);
    const contentCandidates = collectCandidates(section.content);
    const candidates = new Set<string>([...headingCandidates, ...contentCandidates]);
    const suggestions: LinkSuggestion[] = [];

    for (const word of candidates) {
      const symbols = db.getSymbolByName(word);
      for (const sym of symbols) {
        const linked = db.hasEdge(section.id, sym.id);
        const inHeading = headingCandidates.has(word);
        suggestions.push({
          docSection: section,
          symbol: sym,
          reason: inHeading
            ? `"${word}" appears in section heading`
            : `"${word}" appears in section content`,
          alreadyLinked: linked,
        });
      }
    }
    return suggestions.sort((a, b) =>
      Number(a.alreadyLinked) - Number(b.alreadyLinked) ||
      Number(b.reason.includes('heading')) - Number(a.reason.includes('heading')) ||
      a.symbol.name.localeCompare(b.symbol.name)
    );
  }

  if (args.symbolName) {
    const symbols = db.getSymbolByName(args.symbolName);
    if (!symbols.length) return null;
    const sym = symbols[0];
    const docs = db.searchDocs(sym.name, 20);
    return docs.map((section) => ({
      docSection: section,
      symbol: sym,
      reason: `"${sym.name}" appears in doc content`,
      alreadyLinked: db.hasEdge(section.id, sym.id),
    })).sort((a, b) => Number(a.alreadyLinked) - Number(b.alreadyLinked));
  }

  return null;
}

function collectCandidates(text: string): Set<string> {
  const candidates = new Set<string>(Array.from(text.matchAll(IDENTIFIER_RE), (m) => m[1]));
  for (const match of text.matchAll(CODE_SPAN_SYMBOL_RE)) candidates.add(match[1]);
  return candidates;
}
