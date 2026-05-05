import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';
import type { DocSection, GraphNode, SymbolInfo } from '../../types/index.js';

export const schema = {
  query: z.string().describe('Doc section heading, keyword, or doc:<id> to trace from docs into code flow'),
  maxDocDepth: z.number().int().min(1).max(6).default(3).describe('Max REFERENCES_DOC depth to follow across doc layers'),
  maxCodeDepth: z.number().int().min(1).max(10).default(5).describe('Max CALLS depth to follow from linked symbols'),
};

/**
 * Builds one bridge view from doc layering into code flow:
 * before docs -> focus doc -> after docs -> linked symbols -> CALLS graph.
 *
 * @doc:../../docs/architecture/16-16-code-doc-link-map.md#docs-code-sau-khi-index
 * @doc:../../docs/guide/08-4-4-tab-flow.md#4-4-tab-flow
 */
export function getDocFlowTrace(
  db: GraphDB,
  args: { query: string; maxDocDepth?: number; maxCodeDepth?: number },
) {
  const maxDocDepth = args.maxDocDepth ?? 3;
  const maxCodeDepth = args.maxCodeDepth ?? 5;
  const focusDoc = resolveDocSection(db, args.query);
  if (!focusDoc) return null;

  const beforeDocs = db.getTransitiveRelatedDocs(focusDoc.id, maxDocDepth, 'outgoing');
  const afterDocs = db.getTransitiveRelatedDocs(focusDoc.id, maxDocDepth, 'incoming');
  const analysisDocs = [focusDoc, ...afterDocs.map((item) => item.doc)];
  const analysisDocIds = analysisDocs.map((doc) => doc.id);
  const afterDepthById = new Map(afterDocs.map((item) => [item.doc.id, item.depth]));
  const docById = new Map(analysisDocs.map((doc) => [doc.id, doc]));
  const grouped = new Map<string, {
    symbol: GraphNode;
    edgeTypes: Set<'REFERENCES' | 'DOCUMENTED_BY' | 'EXPLAINS_FLOW'>;
    fromDocs: Array<{
      docSectionId: string;
      heading: string;
      filePath: string;
      slug: string;
      relationToFocus: 'focus' | 'after';
      docDepth: number;
      edgeType: 'REFERENCES' | 'DOCUMENTED_BY' | 'EXPLAINS_FLOW';
    }>;
  }>();

  for (const item of db.getDocLinkedSymbols(analysisDocIds)) {
    const sourceDoc = docById.get(item.docSectionId);
    if (!sourceDoc) continue;
    const entry = grouped.get(item.symbol.id) ?? {
      symbol: item.symbol,
      edgeTypes: new Set<'REFERENCES' | 'DOCUMENTED_BY' | 'EXPLAINS_FLOW'>(),
      fromDocs: [],
    };
    entry.edgeTypes.add(item.edgeType);
    entry.fromDocs.push({
      docSectionId: sourceDoc.id,
      heading: sourceDoc.heading,
      filePath: sourceDoc.filePath,
      slug: sourceDoc.slug,
      relationToFocus: sourceDoc.id === focusDoc.id ? 'focus' : 'after',
      docDepth: sourceDoc.id === focusDoc.id ? 0 : (afterDepthById.get(sourceDoc.id) ?? 1),
      edgeType: item.edgeType,
    });
    grouped.set(item.symbol.id, entry);
  }

  const linkedSymbols = [...grouped.values()].map((entry) => {
    const directCallers = db.getCallers(entry.symbol.id) as SymbolInfo[];
    const directCallees = db.getCallees(entry.symbol.id, 1).map((item) => item.node as SymbolInfo);
    const linkedDocs = db.getLinkedDocs(entry.symbol.id);
    return {
      symbol: entry.symbol as SymbolInfo,
      edgeTypes: [...entry.edgeTypes],
      fromDocs: entry.fromDocs.sort((a, b) => a.docDepth - b.docDepth || a.heading.localeCompare(b.heading)),
      directCallers,
      directCallees,
      linkedDocs,
    };
  }).sort((a, b) => a.symbol.name.localeCompare(b.symbol.name));

  const codeFlows = linkedSymbols.map((item) => ({
    entrySymbol: item.symbol,
    steps: db.getCallees(item.symbol.id, maxCodeDepth).map((step) => ({
      symbol: step.node as SymbolInfo,
      callDepth: step.depth,
      callEdgeType: 'CALLS' as const,
    })),
  }));

  return {
    focusDoc,
    beforeDocs,
    afterDocs,
    linkedSymbols,
    codeFlows,
    summary: {
      beforeDocCount: beforeDocs.length,
      afterDocCount: afterDocs.length,
      linkedSymbolCount: linkedSymbols.length,
      codeFlowCount: codeFlows.length,
    },
  };
}

function resolveDocSection(db: GraphDB, query: string): DocSection | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  let section = trimmed.startsWith('doc:') ? db.getDocSectionById(trimmed) : null;
  if (section) return section;
  const hits = db.searchDocs(trimmed, 10);
  return hits.find((item) => item.heading.toLowerCase() === trimmed.toLowerCase()) ?? hits[0] ?? null;
}
