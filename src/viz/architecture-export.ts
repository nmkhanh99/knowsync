import type { GraphDB } from '../graph/db.js';
import type { DocSection, GraphEdge, GraphNode } from '../types/index.js';
import { basename, dirname } from 'path';

interface ArchitectureExportInput {
  format: string;
  viewType?: string;
  docSectionId?: string;
  docSectionIds?: string;
  focusDocId?: string;
  includeCodeContext?: string;
}

interface ExportNode {
  id: string;
  label: string;
  lane: 'Docs' | 'Code';
}

interface ExportEdge {
  sourceId: string;
  targetId: string;
  type: GraphEdge['type'];
  count: number;
}

interface CodeGroup {
  id: string;
  label: string;
}

function sanitizeNodeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, '_');
}

function escapeLabel(value: string): string {
  return value.replace(/"/g, '\\"');
}

function collectScopeIds(input: ArchitectureExportInput): string[] {
  return [...new Set([
    input.docSectionId,
    ...(input.docSectionIds ? input.docSectionIds.split(',').map((item) => item.trim()) : []),
    input.focusDocId,
  ].filter(Boolean) as string[])];
}

function humanizeViewType(viewType: string): string {
  switch (viewType) {
    case 'context': return 'Context';
    case 'container': return 'Container';
    case 'component': return 'Component';
    case 'code': return 'Code';
    default: return 'Component';
  }
}

function laneTitle(lane: ExportNode['lane'], viewType: string): string {
  if (lane === 'Docs') return viewType === 'context' ? 'Documentation Scope' : 'Documentation';
  switch (viewType) {
    case 'context': return 'System Areas';
    case 'container': return 'Containers';
    case 'component': return 'Components';
    case 'code': return 'Code Symbols';
    default: return 'Code';
  }
}

function edgeAllowedInView(edgeType: GraphEdge['type'], viewType: string): boolean {
  if (viewType === 'context') {
    return ['REFERENCES', 'DOCUMENTED_BY', 'EXPLAINS_FLOW', 'REFERENCES_DOC', 'CALLS', 'IMPORTS'].includes(edgeType);
  }
  if (viewType === 'container') {
    return ['REFERENCES', 'DOCUMENTED_BY', 'EXPLAINS_FLOW', 'REFERENCES_DOC', 'CALLS', 'IMPORTS', 'EXPORTS'].includes(edgeType);
  }
  if (viewType === 'component') {
    return ['REFERENCES', 'DOCUMENTED_BY', 'EXPLAINS_FLOW', 'REFERENCES_DOC', 'CALLS', 'IMPORTS', 'EXPORTS', 'IMPLEMENTS', 'INHERITS'].includes(edgeType);
  }
  return true;
}

function edgeLabel(type: GraphEdge['type']): string {
  switch (type) {
    case 'DOCUMENTED_BY': return 'documents';
    case 'REFERENCES': return 'references';
    case 'EXPLAINS_FLOW': return 'explains';
    case 'REFERENCES_DOC': return 'extends';
    case 'CALLS': return 'calls';
    case 'IMPORTS': return 'imports';
    case 'EXPORTS': return 'exports';
    case 'INHERITS': return 'inherits';
    case 'IMPLEMENTS': return 'implements';
    default: return type.toLowerCase();
  }
}

function symbolLabel(symbol: GraphNode): string {
  const suffix = symbol.type === 'Function' || symbol.type === 'Method' ? '()' : '';
  return `${symbol.name}${suffix}`;
}

function compactCountLabel(label: string, count: number): string {
  return count > 1 ? `${label} (${count})` : label;
}

function relativeCodePath(filePath: string, codeRoots: string[]): string {
  for (const root of codeRoots) {
    if (filePath === root) return basename(filePath);
    if (filePath.startsWith(root + '/')) return filePath.slice(root.length + 1);
  }
  const srcIdx = filePath.lastIndexOf('/src/');
  if (srcIdx >= 0) return filePath.slice(srcIdx + 5);
  return basename(filePath);
}

function stripExtension(filePath: string): string {
  return filePath.replace(/\.[^.]+$/, '');
}

function classifyContextArea(rel: string, symbol: GraphNode): CodeGroup {
  if (symbol.type === 'Requirement' || symbol.filePath.startsWith('requirement:')) {
    return { id: 'ctx:requirements', label: 'Requirements' };
  }
  if (!rel || rel === basename(symbol.filePath)) {
    const extLabel = symbol.filePath.includes('node_modules') ? 'External Dependencies' : 'Runtime Support';
    return { id: `ctx:${extLabel.toLowerCase().replace(/\s+/g, '-')}`, label: extLabel };
  }
  if (rel.startsWith('src/viz/')) return { id: 'ctx:web-ui', label: 'Web UI' };
  if (rel.startsWith('src/mcp/')) return { id: 'ctx:mcp', label: 'MCP' };
  if (rel.startsWith('src/indexer/')) return { id: 'ctx:indexer', label: 'Indexer' };
  if (rel.startsWith('src/graph/')) return { id: 'ctx:graph-store', label: 'Graph Store' };
  if (rel.startsWith('src/cli/')) return { id: 'ctx:cli', label: 'CLI' };
  if (rel.startsWith('src/types/')) return { id: 'ctx:shared-types', label: 'Shared Types' };
  if (rel.startsWith('src/')) return { id: 'ctx:core-runtime', label: 'Core Runtime' };
  return { id: 'ctx:application', label: 'Application' };
}

function classifyContainerArea(rel: string, symbol: GraphNode): CodeGroup {
  if (symbol.type === 'Requirement' || symbol.filePath.startsWith('requirement:')) {
    return { id: 'ctr:requirements', label: 'Requirements' };
  }
  if (!rel || rel === basename(symbol.filePath)) {
    return { id: 'ctr:external', label: symbol.filePath.includes('node_modules') ? 'External Dependencies' : 'Runtime Support' };
  }
  if (rel.startsWith('src/mcp/tools/')) return { id: 'ctr:mcp-tools', label: 'MCP / Tools' };
  if (rel.startsWith('src/mcp/')) return { id: 'ctr:mcp-core', label: 'MCP / Core' };
  if (rel.startsWith('src/viz/public/')) return { id: 'ctr:web-ui-client', label: 'Web UI / Client' };
  if (rel.startsWith('src/viz/')) return { id: 'ctr:web-ui-server', label: 'Web UI / Server' };
  if (rel.startsWith('src/indexer/')) return { id: 'ctr:indexer', label: 'Indexer' };
  if (rel.startsWith('src/graph/')) return { id: 'ctr:graph-store', label: 'Graph Store' };
  if (rel.startsWith('src/cli/')) return { id: 'ctr:cli', label: 'CLI' };
  if (rel.startsWith('src/types/')) return { id: 'ctr:shared-types', label: 'Shared Types' };
  const parts = rel.split('/').filter(Boolean);
  const fallback = parts.slice(0, Math.min(parts.length - 1, 2)).join('/') || dirname(rel);
  return { id: `ctr:${fallback}`, label: fallback };
}

function groupKeyForSymbol(symbol: GraphNode, viewType: string, codeRoots: string[]): CodeGroup {
  const rel = relativeCodePath(symbol.filePath, codeRoots);
  if (viewType === 'context') {
    return classifyContextArea(rel, symbol);
  }
  if (viewType === 'container') {
    return classifyContainerArea(rel, symbol);
  }
  if (viewType === 'component') {
    const label = symbol.type === 'Requirement' || symbol.filePath.startsWith('requirement:')
      ? `Requirements/${symbol.name}`
      : stripExtension(rel);
    return { id: `cmp:${label}`, label };
  }
  return { id: symbol.id, label: symbolLabel(symbol) };
}

function reduceGraph(
  docs: DocSection[],
  symbols: GraphNode[],
  edges: GraphEdge[],
  viewType: string,
  codeRoots: string[],
): { nodes: ExportNode[]; edges: ExportEdge[] } {
  const docIds = new Set(docs.map((doc) => doc.id));
  const symbolMap = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  const exportNodes = new Map<string, ExportNode>();
  const exportEdges = new Map<string, ExportEdge>();

  for (const doc of docs) {
    const docNodeId = viewType === 'context' ? 'docs:focus' : doc.id;
    const docLabel = viewType === 'context'
      ? compactCountLabel('Docs', docs.length)
      : doc.heading;
    exportNodes.set(docNodeId, { id: docNodeId, label: docLabel, lane: 'Docs' });
  }

  for (const symbol of symbols) {
    const group = groupKeyForSymbol(symbol, viewType, codeRoots);
    if (!exportNodes.has(group.id)) {
      exportNodes.set(group.id, { id: group.id, label: group.label, lane: 'Code' });
    }
  }

  for (const edge of edges) {
    if (!edgeAllowedInView(edge.type, viewType)) continue;
    const sourceDoc = docIds.has(edge.sourceId);
    const targetDoc = docIds.has(edge.targetId);
    const sourceSymbol = symbolMap.get(edge.sourceId);
    const targetSymbol = symbolMap.get(edge.targetId);
    let sourceId = '';
    let targetId = '';

    if (sourceDoc) sourceId = viewType === 'context' ? 'docs:focus' : edge.sourceId;
    else if (sourceSymbol) sourceId = groupKeyForSymbol(sourceSymbol, viewType, codeRoots).id;

    if (targetDoc) targetId = viewType === 'context' ? 'docs:focus' : edge.targetId;
    else if (targetSymbol) targetId = groupKeyForSymbol(targetSymbol, viewType, codeRoots).id;

    if (!sourceId || !targetId || sourceId === targetId) continue;
    const key = `${sourceId}|${targetId}|${edge.type}`;
    const current = exportEdges.get(key);
    if (current) current.count += 1;
    else exportEdges.set(key, { sourceId, targetId, type: edge.type, count: 1 });
  }

  const reducedEdges = [...exportEdges.values()].sort((a, b) =>
    a.sourceId.localeCompare(b.sourceId) ||
    a.targetId.localeCompare(b.targetId) ||
    a.type.localeCompare(b.type)
  );
  const connectedNodeIds = new Set<string>();
  for (const edge of reducedEdges) {
    connectedNodeIds.add(edge.sourceId);
    connectedNodeIds.add(edge.targetId);
  }
  const reducedNodes = [...exportNodes.values()]
    .filter((node) => node.lane === 'Docs' || connectedNodeIds.has(node.id))
    .sort((a, b) =>
      a.lane.localeCompare(b.lane) ||
      a.label.localeCompare(b.label)
    );

  return { nodes: reducedNodes, edges: reducedEdges };
}

function exportEdgeLabel(edge: ExportEdge): string {
  return edge.count > 1 ? `${edgeLabel(edge.type)} x${edge.count}` : edgeLabel(edge.type);
}

function buildMermaid(title: string, nodes: ExportNode[], edges: ExportEdge[], viewType: string): string {
  const lines = ['flowchart LR', `  %% ${title}`, '  classDef docs fill:#1d4ed8,stroke:#60a5fa,color:#eff6ff;', '  classDef code fill:#14532d,stroke:#4ade80,color:#f0fdf4;'];

  const docNodes = nodes.filter((node) => node.lane === 'Docs');
  const codeNodes = nodes.filter((node) => node.lane === 'Code');

  if (docNodes.length) {
    lines.push(`  subgraph ${laneTitle('Docs', viewType)}`);
    for (const node of docNodes) {
      lines.push(`    ${sanitizeNodeId(node.id)}["${escapeLabel(node.label)}"]`);
      lines.push(`    class ${sanitizeNodeId(node.id)} docs`);
    }
    lines.push('  end');
  }

  if (codeNodes.length) {
    lines.push(`  subgraph ${laneTitle('Code', viewType)}`);
    for (const node of codeNodes) {
      lines.push(`    ${sanitizeNodeId(node.id)}["${escapeLabel(node.label)}"]`);
      lines.push(`    class ${sanitizeNodeId(node.id)} code`);
    }
    lines.push('  end');
  }

  for (const edge of edges) {
    lines.push(`  ${sanitizeNodeId(edge.sourceId)} -->|${exportEdgeLabel(edge)}| ${sanitizeNodeId(edge.targetId)}`);
  }

  return lines.join('\n');
}

function buildPlantUml(title: string, nodes: ExportNode[], edges: ExportEdge[], viewType: string): string {
  const lines = ['@startuml', 'left to right direction', `title ${title}`];
  const docNodes = nodes.filter((node) => node.lane === 'Docs');
  const codeNodes = nodes.filter((node) => node.lane === 'Code');

  if (docNodes.length) {
    lines.push(`package "${laneTitle('Docs', viewType)}" {`);
    for (const node of docNodes) {
      lines.push(`  rectangle "${node.label}" as ${sanitizeNodeId(node.id)}`);
    }
    lines.push('}');
  }

  if (codeNodes.length) {
    lines.push(`package "${laneTitle('Code', viewType)}" {`);
    for (const node of codeNodes) {
      lines.push(`  component "${node.label}" as ${sanitizeNodeId(node.id)}`);
    }
    lines.push('}');
  }

  for (const edge of edges) {
    lines.push(`${sanitizeNodeId(edge.sourceId)} --> ${sanitizeNodeId(edge.targetId)} : ${exportEdgeLabel(edge)}`);
  }

  lines.push('@enduml');
  return lines.join('\n');
}

/**
 * Builds stakeholder-facing Mermaid/PlantUML diagrams from the live doc neighborhood.
 * @doc:../../docs/requirements/prd-living-architecture-and-freshness.md#prd-arch-001-c4-architecture-surfaces-va-diagram-export
 * @doc:../../docs/requirements/frd-architecture-surfaces-and-freshness.md#frd-func-010-diagram-generation-va-architecture-surface-delivery
 *
 * PRD-ARCH-001: architecture surfaces and diagram export.
 * FRD-FUNC-010: export delivery from the live graph.
 */
export function resolveArchitectureExportRequest(db: GraphDB, input: ArchitectureExportInput): {
  status: number;
  body: Record<string, unknown>;
} {
  const format = String(input.format || '').toLowerCase();
  if (!['mermaid', 'plantuml'].includes(format)) {
    return { status: 400, body: { error: 'Supported formats: mermaid, plantuml' } };
  }

  const scopeIds = collectScopeIds(input);
  if (!scopeIds.length) {
    return { status: 400, body: { error: 'A doc scope is required for architecture export' } };
  }

  const data = db.getDocNeighborhoodForIds(scopeIds, {
    includeCodeContext: input.includeCodeContext === '1',
    focusDocId: input.focusDocId ?? scopeIds[0] ?? null,
  });
  if (!data.docSections.length) {
    return { status: 404, body: { error: 'Doc section not found' } };
  }

  const focusDoc = data.docSections.find((doc) => doc.id === data.focusDocId) ?? data.docSections[0];
  const viewType = ['context', 'container', 'component', 'code'].includes(String(input.viewType || 'component'))
    ? String(input.viewType || 'component')
    : 'component';
  const viewLabel = humanizeViewType(viewType);
  const codeRoots = (db.getProjectConfig<Array<{ path: string }>>('codeSources') ?? []).map((source) => source.path).filter(Boolean);
  const reduced = reduceGraph(data.docSections, data.symbols, data.edges, viewType, codeRoots);
  const title = `${focusDoc?.heading ?? 'Architecture'} - ${viewLabel} View`;
  const diagram = format === 'mermaid'
    ? buildMermaid(title, reduced.nodes, reduced.edges, viewType)
    : buildPlantUml(title, reduced.nodes, reduced.edges, viewType);
  const safeHeading = String(focusDoc?.heading ?? 'architecture')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'architecture';
  const filename = `knowsync-${safeHeading}-${viewType}.${format === 'plantuml' ? 'puml' : 'mmd'}`;

  return {
    status: 200,
    body: {
      format,
      viewType,
      viewLabel,
      target: focusDoc?.id ?? null,
      summary: {
        docCount: data.docSections.length,
        symbolCount: data.symbols.length,
        edgeCount: data.edges.length,
        exportNodeCount: reduced.nodes.length,
        exportEdgeCount: reduced.edges.length,
        includeCodeContext: input.includeCodeContext === '1',
      },
      filename,
      diagram,
    },
  };
}
