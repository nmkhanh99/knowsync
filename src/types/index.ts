export type NodeType =
  | 'Function'
  | 'Class'
  | 'Method'
  | 'Module'
  | 'Interface'
  | 'Type'
  | 'Variable'
  | 'Export'
  | 'DocSection'
  | 'Heading'
  | 'Requirement';

export type EdgeType =
  | 'CALLS'
  | 'IMPORTS'
  | 'DOCUMENTED_BY'
  | 'REFERENCES'
  | 'REFERENCES_DOC'
  | 'EXPLAINS_FLOW'
  | 'EXPORTS'
  | 'INHERITS'
  | 'IMPLEMENTS'
  | 'SATISFIES';

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  clusterId?: string;
  signature?: string;
  docString?: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  type: EdgeType;
  sourceId: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

export interface DocSection {
  id: string;
  filePath: string;
  heading: string;
  slug: string;
  headingLevel: number;
  content: string;
  primarySymbolName?: string;
  linkedSymbols: string[];
  linkedDocTargets?: string[];
  linkedRequirements?: string[];
  metadata?: Record<string, unknown>;
  startLine: number;
  endLine: number;
}

export interface EmbeddedDocRegion {
  id: string;
  filePath: string;
  heading: string;
  content: string;
  startLine: number;
  endLine: number;
  metadata?: Record<string, unknown>;
  sections: DocSection[];
}

export interface PendingCall {
  callerId: string;
  calleeName: string;
}

export interface ParsedFile {
  filePath: string;
  language: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  embeddedDocs: DocSection[];
  embeddedDocRegions: EmbeddedDocRegion[];
  /** Calls whose callee couldn't be resolved within this file — resolved in second pass */
  pendingCalls: PendingCall[];
  lastModified: number;
  contentHash: string;
}

export interface ParsedDoc {
  filePath: string;
  sections: DocSection[];
  lastModified: number;
  contentHash: string;
}

export interface DocSourceConfig {
  path: string;           // Relative path, directory, or glob: "docs", "wiki", "docs/**/*.md", "README.md"
  label?: string;         // Display label: "Kiến trúc", "Hướng dẫn", "Phát triển"
  excludeFiles?: string[]; // File names to hide from Visual Docs, e.g. ["full.md"]
  order?: number;         // Display order in Visual Docs (ascending)
  color?: string;         // Hex color hint for graph nodes in this set
}

export interface CodeSourceConfig {
  path: string;           // Relative path or directory: "src", "lib/core", "packages/api"
  label?: string;         // Display label
}

export interface VisualDocsConfig {
  structureMode: 'file' | 'folder' | 'docSource' | 'flat';
  folderDepth: number;
}

export interface IndexOptions {
  includeDocs: boolean;
  delta: boolean;
  languages?: string[];
  docSources?: DocSourceConfig[];  // If provided, crawl only these paths for docs
  codeSources?: CodeSourceConfig[]; // If provided, crawl only these paths for code
}

export interface KnowSyncConfig {
  include: string[];
  exclude: string[];
  languages: string[];
  docsGlob: string;               // Legacy glob — fallback when docSources is empty
  docSources: DocSourceConfig[];  // Explicit doc source directories / files / globs
  visualDocs: VisualDocsConfig;
  groupDocsBy?: 'by-file' | 'by-folder' | 'by-doc-source' | 'flat';
}

export interface ClusterResult {
  nodeId: string;
  clusterId: string;
  clusterName?: string;
}

export interface SymbolInfo {
  id: string;
  name: string;
  type: NodeType;
  filePath: string;
  startLine: number;
  endLine: number;
  signature?: string;
  docString?: string;
  clusterId?: string;
}

export interface ImpactResult {
  directlyAffected: SymbolInfo[];
  transitivelyAffected: SymbolInfo[];
  linkedDocs: DocSection[];
}

export interface ProcessFlow {
  entryPoint: SymbolInfo;
  steps: Array<{
    symbol: SymbolInfo;
    callDepth: number;
    callEdgeType: EdgeType;
  }>;
}

export interface DocSyncResult {
  symbol: SymbolInfo;
  linkedDocs: DocSection[];
  isSynced: boolean;
  issues: string[];
}

export interface HealthDashboardSnapshot {
  symbolCount: number;
  edgeCount: number;
  docSectionCount: number;
  requirementCount: number;
  documentableSymbolCount: number;
  undocumentedSymbolCount: number;
  coveragePct: number;
  totalLinks: number;
  staleLinkCount: number;
  unresolvedMarkCount: number;
  orphanedMarkCount: number;
  tracedRequirementCount: number;
  traceCompletenessPct: number;
  lastIndexedAt: number | null;
  freshnessAgeMs: number | null;
  lastIndexMode?: 'full' | 'delta' | null;
  lastIndexCodeFiles?: number;
  lastIndexDocFiles?: number;
  lastIndexSkipped?: number;
  lastIndexErrors?: number;
  lastIndexElapsedMs?: number;
  prunedFileCount?: number;
  provenanceConfidencePct: number;
  driftScore: number;
}

export interface ParseRule {
  id: string;
  language: string;
  ruleType: string;
  name: string;
  query: string;
  packName?: string;
  nodeType?: string;
  edgeType?: string;
  nameCapture?: string;
  sourceCapture?: string;
  targetCapture?: string;
  docCapture?: string;
  symbolCapture?: string;
  priority?: number;
}

export interface ParseArtifact {
  id: string;
  language: string;
  artifactType: 'injection_query' | 'included_ranges';
  name: string;
  packName?: string;
  content?: string;
  query?: string;
  targetLanguage?: string;
  rangeCapture?: string;
  priority?: number;
}

export interface RuleSet {
  id: string;
  projectId: string | null;
  name: string;
  description: string;
  language: string;
  version: string;
  isGlobal: boolean;
  parentId: string | null;
  grammarWasmUrl: string;
  createdAt: number;
  updatedAt: number;
}

export interface ResolvedRuleSet extends RuleSet {
  chain: RuleSet[];           // ancestry from root to this node
  rules: ParseRule[];         // merged rules (parent first, child overrides)
  artifacts: ParseArtifact[]; // merged artifacts
}

export interface RuleLink {
  id: string;
  sourceId: string;
  targetId: string;
  linkType: 'inherit' | 'override' | 'inject';
  createdAt: number;
}
