import { z } from 'zod';
import { makeDocId } from '../../graph/builder.js';
import type { GraphDB } from '../../graph/db.js';

export const schema = {
  symbolName: z.string().describe('Name of the symbol this doc section documents'),
  heading: z.string().describe('Heading for the doc section'),
  content: z.string().describe('Markdown content to write into the doc section'),
  filePath: z.string().optional().describe('MD file path (default: <projectRoot>/docs/generated.md)'),
  startLine: z.number().optional(),
};

/**
 * Auto-documented structural element.
 */
function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function regenerateDoc(
  db: GraphDB,
  args: { symbolName: string; heading: string; content: string; filePath?: string; startLine?: number },
) {
  const symbols = db.getSymbolByName(args.symbolName);
  if (!symbols.length) return { ok: false, error: `Symbol not found: ${args.symbolName}` };

  const sym = symbols[0];
  const filePath = args.filePath ?? `${sym.filePath.replace(/\/[^/]+$/, '')}/docs/generated.md`;
  const startLine = args.startLine ?? 1;
  const id = makeDocId(filePath, args.heading, startLine);

  const section = {
    id,
    filePath,
    heading: args.heading,
    slug: slugify(args.heading),
    headingLevel: 2,
    content: args.content,
    linkedSymbols: [args.symbolName],
    startLine,
    endLine: startLine + args.content.split('\n').length,
  };

  db.upsertDocSection(section);

  const edgeId = `${id}->DOCUMENTED_BY->${sym.id}`;
  db.createManualEdge({ id: edgeId, type: 'DOCUMENTED_BY', sourceId: id, targetId: sym.id });

  return { ok: true, docSectionId: id, symbolId: sym.id, slug: section.slug, edgeId };
}
