import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';

export const schema = {
  pattern: z.string().optional().describe('Filter by heading or file path pattern'),
  symbolName: z.string().optional().describe('Filter to docs linked to a specific symbol'),
  includeAllCode: z.boolean().optional().describe('If true, include broader code context instead of only symbols already linked to docs'),
};

interface DocTreeNode {
  id: string;
  heading: string;
  headingLevel: number;
  parentHeading?: string;
  path: string[];
  filePath: string;
  startLine: number;
  endLine: number;
  contentPreview: string;
  sourceArtifact?: Record<string, unknown>;
  children: DocTreeNode[];
}

interface EmbeddedDocRegionView {
  id: string;
  heading: string;
  filePath: string;
  startLine: number;
  endLine: number;
  contentPreview: string;
  sourceArtifact?: Record<string, unknown>;
  roots: DocTreeNode[];
}

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function getDocVisualization(
  db: GraphDB,
  args: { pattern?: string; symbolName?: string; includeAllCode?: boolean },
) {
  if (args.symbolName) {
    const symbols = db.getSymbolByName(args.symbolName);
    if (!symbols.length) return { docSections: [], symbols: [], edges: [] };
    const sym = symbols[0];
    const docs = db.getLinkedDocs(sym.id);
    return {
      docSections: docs.map((doc) => ({
        ...doc,
        sourceArtifact: (doc.metadata?.['sourceArtifact'] as Record<string, unknown> | undefined) ?? undefined,
      })),
      embeddedDocRegions: buildEmbeddedDocRegions(docs),
      symbols: [sym],
      edges: docs.map(d => ({ sourceId: d.id, targetId: sym.id, type: 'DOCUMENTED_BY' })),
    };
  }

  const { docSections, symbols, edges } = db.getDocSubgraph(args.pattern, { includeAllCode: args.includeAllCode });
  return {
    docSections: docSections.map((doc) => ({
      ...doc,
      sourceArtifact: (doc.metadata?.['sourceArtifact'] as Record<string, unknown> | undefined) ?? undefined,
    })),
    embeddedDocRegions: buildEmbeddedDocRegions(docSections),
    symbols,
    edges,
  };
}

function buildEmbeddedDocRegions(docSections: Array<{
  id: string;
  filePath: string;
  heading: string;
  headingLevel: number;
  content: string;
  startLine: number;
  endLine: number;
  metadata?: Record<string, unknown>;
}>): EmbeddedDocRegionView[] {
  const grouped = new Map<string, { sourceArtifact: Record<string, unknown>; sections: Array<DocTreeNode & { regionId: string }> }>();

  for (const doc of docSections) {
    const sourceArtifact = doc.metadata?.['sourceArtifact'] as Record<string, unknown> | undefined;
    if (!sourceArtifact) continue;
    if (sourceArtifact['targetLanguage'] !== 'markdown') continue;
    const regionId = String(sourceArtifact['regionId'] ?? '');
    if (!regionId) continue;
    const node: DocTreeNode & { regionId: string } = {
      regionId,
      id: doc.id,
      heading: doc.heading,
      headingLevel: doc.headingLevel,
      filePath: doc.filePath,
      startLine: doc.startLine,
      endLine: doc.endLine,
      contentPreview: doc.content.slice(0, 240),
      sourceArtifact,
      path: [doc.heading],
      children: [],
    };
    const current = grouped.get(regionId);
    if (current) {
      current.sections.push(node);
    } else {
      grouped.set(regionId, { sourceArtifact, sections: [node] });
    }
  }

  return Array.from(grouped.entries()).map(([regionId, group]) => {
    const roots = buildTree(group.sections);
    const first = group.sections[0];
    return {
      id: regionId,
      heading: String(group.sourceArtifact['name'] ?? 'Embedded Markdown Region'),
      filePath: first?.filePath ?? '',
      startLine: Math.min(...group.sections.map((section) => section.startLine)),
      endLine: Math.max(...group.sections.map((section) => section.endLine)),
      contentPreview: first?.contentPreview ?? '',
      sourceArtifact: group.sourceArtifact,
      roots,
    };
  });
}

/**
 * Auto-documented structural element.
 */
function buildTree(nodes: Array<DocTreeNode & { regionId: string }>): DocTreeNode[] {
  const roots: DocTreeNode[] = [];
  const stack: DocTreeNode[] = [];
  const sorted = [...nodes].sort((a, b) =>
    a.startLine - b.startLine || a.headingLevel - b.headingLevel || a.endLine - b.endLine || a.id.localeCompare(b.id)
  );

  for (const node of sorted) {
    const current: DocTreeNode = { ...node, children: [], path: [node.heading] };
    while (stack.length > 0 && stack[stack.length - 1].headingLevel >= current.headingLevel) {
      stack.pop();
    }
    const parent = stack.at(-1);
    if (parent) {
      current.parentHeading = parent.heading;
      current.path = [...parent.path, node.heading];
      parent.children.push(current);
    } else {
      current.parentHeading = undefined;
      roots.push(current);
    }
    stack.push(current);
  }

  return roots;
}
