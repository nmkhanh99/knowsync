import { createHash } from 'crypto';
import { createRequire } from 'module';
import type { GraphNode, GraphEdge, ParsedFile, ParsedDoc } from '../types/index.js';
import type { GraphDB } from './db.js';

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GraphologyLib = require('graphology') as any;
const GraphClass = GraphologyLib.default ?? GraphologyLib;

export type InMemoryGraph = {
  order: number;
  hasNode: (id: string) => boolean;
  hasEdge: (id: string) => boolean;
  addNode: (id: string, attrs: object) => void;
  addEdgeWithKey: (key: string, src: string, tgt: string, attrs: object) => void;
  forEachNode: (cb: (id: string, attrs: Record<string, unknown>) => void) => void;
  degree: (id: string) => number;
  getNodeAttribute: (id: string, attr: string) => unknown;
};

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export function makeNodeId(filePath: string, name: string, startLine: number): string {
  return createHash('sha1').update(`${filePath}:${name}:${startLine}`).digest('hex').slice(0, 16);
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export function makeDocId(filePath: string, heading: string, startLine: number): string {
  return 'doc:' + createHash('sha1').update(`${filePath}:${heading}:${startLine}`).digest('hex').slice(0, 16);
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export function persistParsedFile(db: GraphDB, parsed: ParsedFile): void {
  db.deleteByFilePath(parsed.filePath);
  for (const node of parsed.nodes) db.upsertNode(node);
  for (const section of parsed.embeddedDocs) db.upsertDocSection(section);
  for (const edge of parsed.edges) db.upsertEdge(edge);
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export function persistParsedDoc(db: GraphDB, parsed: ParsedDoc): void {
  db.deleteByFilePath(parsed.filePath);
  for (const section of parsed.sections) db.upsertDocSection(section);
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export function buildInMemoryGraph(nodes: GraphNode[], edges: GraphEdge[]): InMemoryGraph {
  const graph: InMemoryGraph = new GraphClass({ type: 'directed', multi: false });

  for (const node of nodes) {
    if (!graph.hasNode(node.id)) graph.addNode(node.id, { ...node });
  }

  for (const edge of edges) {
    if (graph.hasNode(edge.sourceId) && graph.hasNode(edge.targetId)) {
      const edgeKey = `${edge.sourceId}->${edge.targetId}:${edge.type}`;
      if (!graph.hasEdge(edgeKey)) {
        graph.addEdgeWithKey(edgeKey, edge.sourceId, edge.targetId, { type: edge.type });
      }
    }
  }

  return graph;
}
