import { crawlRepo } from './file-crawler.js';
import { parseCodeFile } from './code-parser.js';
import { parseDocFile } from './docs-parser.js';
import { persistParsedFile, persistParsedDoc } from '../graph/builder.js';
import { buildInMemoryGraph } from '../graph/builder.js';
import { clusterGraph, persistClusters } from '../graph/clustering.js';
import type { GraphDB } from '../graph/db.js';
import { makeNodeId } from '../graph/builder.js';
import type { GraphNode, IndexOptions, ParseArtifact, ParseRule, PendingCall } from '../types/index.js';
import type { DocSection, DocSourceConfig } from '../types/index.js';
import { dirname, resolve } from 'path';

export interface IndexSummary {
  codeFiles: number;
  docFiles: number;
  skipped: number;
  errors: number;
  nodes: number;
  edges: number;
  clusters: number;
  elapsedMs: number;
}

/**
 * @runIndex is the main indexing pipeline for a project.
 * It crawls repo files, parses code and Markdown, wires symbol and requirement
 * links, resolves cross-file calls, and persists clustering results via @GraphDB.
 *
 * @doc:../../docs/architecture/01-1-tong-quan.md#1-tong-quan
 * @doc:../../docs/architecture/02-2-pipeline-tong-the.md#2-pipeline-tong-the
 * @doc:../../docs/guide/03-3-index-xay-dung-knowledge-graph.md#3-index-xay-dung-knowledge-graph
 *
 * BRD-REQ-001: index code and docs into one graph.
 * PRD-UI-002: keep embedded Markdown regions available for Visual Docs.
 */
export async function runIndex(db: GraphDB, options: IndexOptions): Promise<IndexSummary> {
  const { includeDocs, delta, languages, docSources, codeSources } = options;
  validateIndexSources({ includeDocs, codeSources, docSources });
  const t0 = Date.now();
  const parseRulesByLanguage = groupParseRulesByLanguage(db.getParseRules());
  const parseArtifactsByLanguage = groupParseArtifactsByLanguage(db.getParseArtifacts());

  console.log(`  Scanning configured sources${delta ? ' (delta)' : ''} …`);
  const { codeFiles, docFiles } = await crawlRepo(languages, docSources, codeSources?.length ? codeSources : undefined);
  console.log(`  Found ${codeFiles.length} code + ${docFiles.length} doc files`);

  let errors = 0;
  let totalNodes = 0;
  let totalEdges = 0;
  const allPendingCalls: PendingCall[] = [];

  // ─── Parse code files ───────────────────────────────────────────────────────

  let codeParsed = 0;
  let codeSkipped = 0;
  process.stdout.write('  Parsing code ');

  for (const file of codeFiles) {
    if (delta && db.isFileCached(file.filePath, file.contentHash)) {
      codeSkipped++;
      continue;
    }

      try {
        const result = await parseCodeFile(
          file.filePath,
        file.language,
        file.contentHash,
        file.lastModified,
          parseRulesByLanguage.get(file.language) ?? [],
          parseArtifactsByLanguage.get(file.language) ?? [],
        );
        const embeddedDocs = filterDocSectionsBySources(result.embeddedDocs, docSources);
        const filteredResult = {
          ...result,
          embeddedDocs,
        };
        db.transaction(() => {
          persistParsedFile(db, filteredResult);
          wireSymbolLinksFromDocs(db, embeddedDocs);
          wireRequirementLinksFromDocs(db, embeddedDocs);
          wireRequirementLinksFromCode(db, filteredResult.nodes);
          db.updateFileCache(file.filePath, file.contentHash);
        });
        allPendingCalls.push(...filteredResult.pendingCalls);
        totalNodes += filteredResult.nodes.length;
        totalEdges += filteredResult.edges.length;
      } catch (err) {
        errors++;
        process.stderr.write(`\n  ! ${file.filePath}: ${(err as Error).message}\n`);
    }

    codeParsed++;
    if (codeParsed % 25 === 0) process.stdout.write('.');
  }
  process.stdout.write(` ${codeFiles.length - codeSkipped} parsed, ${codeSkipped} skipped\n`);

  // ─── Parse doc files ────────────────────────────────────────────────────────

  if (includeDocs) {
    let docParsed = 0;
    let docSkipped = 0;
    process.stdout.write('  Parsing docs ');

    for (const file of docFiles) {
      if (delta && db.isFileCached(file.filePath, file.contentHash)) {
        docSkipped++;
        continue;
      }

      try {
        const result = await parseDocFile(file.filePath, file.contentHash, file.lastModified);
        db.transaction(() => {
          persistParsedDoc(db, result);
          wireSymbolLinksFromDocs(db, result.sections);
          wireRequirementLinksFromDocs(db, result.sections);
          db.updateFileCache(file.filePath, file.contentHash);
        });
      } catch (err) {
        errors++;
        process.stderr.write(`\n  ! ${file.filePath}: ${(err as Error).message}\n`);
      }

      docParsed++;
      if (docParsed % 10 === 0) process.stdout.write('.');
    }
    process.stdout.write(` ${docFiles.length - docSkipped} parsed, ${docSkipped} skipped\n`);
  }

  wireDocLinksFromAllDocs(db);

  // ─── Cross-file call resolution (second pass) ───────────────────────────────
  // Pending calls are callee names that couldn't be resolved within a single
  // file.  Now that all files are in the DB, look each callee up and create edges.

  process.stdout.write('  Resolving cross-file calls … ');
  const crossFileEdges = resolvePendingCalls(db, allPendingCalls);
  totalEdges += crossFileEdges;
  process.stdout.write(`${crossFileEdges} new edges\n`);

  db.deleteOrphanRequirements();

  // ─── Clustering (always uses all DB nodes so delta runs stay consistent) ────

  process.stdout.write('  Clustering … ');
  const allNodes = db.getAllNodes();
  const allEdges = db.getAllEdges();
  const graph = buildInMemoryGraph(allNodes, allEdges);
  const clusters = clusterGraph(graph);
  persistClusters(db, clusters);
  process.stdout.write(`${clusters.length} assignments\n`);

  const summary: IndexSummary = {
    codeFiles: codeFiles.length,
    docFiles: includeDocs ? docFiles.length : 0,
    skipped: codeSkipped,
    errors,
    nodes: totalNodes,
    edges: totalEdges,
    clusters: clusters.length,
    elapsedMs: Date.now() - t0,
  };

  printSummary(summary);
  return summary;
}

/**
 * Index boundaries are strict: code only from Code Sources, docs only from Doc Sources.
 * @doc:../../docs/architecture/02-2-pipeline-tong-the.md#quy-uoc-source-boundaries
 * @doc:../../docs/architecture/03-3-filecrawler.md#boundary-rule-khi-index
 */
function validateIndexSources(options: {
  includeDocs: boolean;
  codeSources?: IndexOptions['codeSources'];
  docSources?: IndexOptions['docSources'];
}): void {
  if (!options.codeSources?.length) {
    throw new Error('No Code Sources configured. Configure Code Sources before indexing.');
  }
  if (options.includeDocs && !options.docSources?.length) {
    throw new Error('No Doc Sources configured. Configure Doc Sources before indexing docs.');
  }
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 * @doc:../../docs/architecture/03-3-filecrawler.md#boundary-rule-khi-index
 */
function wireRequirementLinksFromCode(db: GraphDB, nodes: GraphNode[]): void {
  for (const node of nodes) {
    const requirementIds = Array.isArray(node.metadata?.['requirementIds'])
      ? (node.metadata!['requirementIds'] as string[])
      : [];
    for (const requirementId of requirementIds) {
      const requirementNode = makeRequirementNode(requirementId, node.filePath);
      db.upsertNode(requirementNode);
      db.upsertEdge({
        id: `${node.id}->SATISFIES->${requirementNode.id}`,
        type: 'SATISFIES',
        sourceId: node.id,
        targetId: requirementNode.id,
      });
    }
  }
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 * @doc:../../docs/architecture/05-5-docsparser.md#5-docsparser
 */
function wireSymbolLinksFromDocs(
  db: GraphDB,
  sections: Array<{ id: string; linkedSymbols: string[]; primarySymbolName?: string }>,
): void {
  for (const section of sections) {
    const primaryTargets = section.primarySymbolName ? db.getSymbolByName(section.primarySymbolName) : [];
    for (const target of primaryTargets) {
      db.upsertEdge({
        id: `${section.id}->DOCUMENTED_BY->${target.id}`,
        type: 'DOCUMENTED_BY',
        sourceId: section.id,
        targetId: target.id,
      });
    }

    for (const symbolName of section.linkedSymbols) {
      const targets = db.getSymbolByName(symbolName);
      for (const target of targets) {
        if (section.primarySymbolName === symbolName) continue;
        db.upsertEdge({
          id: `${section.id}->REFERENCES->${target.id}`,
          type: 'REFERENCES',
          sourceId: section.id,
          targetId: target.id,
        });
      }
    }
  }
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 * @doc:../../docs/architecture/05-5-docsparser.md#5-docsparser
 */
function wireRequirementLinksFromDocs(
  db: GraphDB,
  sections: Array<{ id: string; filePath: string; content: string; linkedRequirements?: string[] }>,
): void {
  for (const section of sections) {
    for (const requirementId of section.linkedRequirements ?? []) {
      const requirementNode = makeRequirementNode(requirementId, section.filePath, section.content);
      db.upsertNode(requirementNode);
      db.upsertEdge({
        id: `${section.id}->DOCUMENTED_BY->${requirementNode.id}`,
        type: 'DOCUMENTED_BY',
        sourceId: section.id,
        targetId: requirementNode.id,
      });
    }
  }
}

/**
 * Later docs and code comment-docs can explicitly map to earlier docs via
 * @doc:path/to/file.md#slug or [[doc:path/to/file.md#slug]] annotations.
 * @doc:../../docs/guide/19-9-huong-dan-ra-lenh-cho-ai-agent-qua-mcp.md#chuan-annotation-khi-ai-viet-docscode
 */
function wireDocLinksFromAllDocs(db: GraphDB): void {
  const sections = db.searchDocs('', 5000);
  const docsByFile = new Map<string, DocSection[]>();

  for (const section of sections) {
    const list = docsByFile.get(section.filePath) ?? [];
    list.push(section);
    docsByFile.set(section.filePath, list);
  }

  for (const section of sections) {
    for (const rawTarget of section.linkedDocTargets ?? []) {
      const target = resolveDocTarget(db, section.filePath, rawTarget, docsByFile);
      if (!target || target.id === section.id) continue;
      db.upsertEdge({
        id: `${section.id}->REFERENCES_DOC->${target.id}`,
        type: 'REFERENCES_DOC',
        sourceId: section.id,
        targetId: target.id,
      });
    }
  }
}

/**
 * Auto-documented structural element.
 */
function resolveDocTarget(
  db: GraphDB,
  sourceFilePath: string,
  rawTarget: string,
  docsByFile: Map<string, DocSection[]>,
): DocSection | null {
  const target = String(rawTarget || '').trim();
  if (!target) return null;

  const hashIndex = target.lastIndexOf('#');
  const rawPath = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
  const slug = hashIndex >= 0 ? target.slice(hashIndex + 1) : '';

  const candidatePaths = new Set<string>();
  if (!rawPath || rawPath === sourceFilePath) {
    candidatePaths.add(sourceFilePath);
  } else if (rawPath.startsWith('/')) {
    candidatePaths.add(rawPath);
  } else {
    candidatePaths.add(resolve(dirname(sourceFilePath), rawPath));
  }

  for (const filePath of candidatePaths) {
    if (slug) {
      const bySlug = db.getDocSectionByPathAndSlug(filePath, slug);
      if (bySlug) return bySlug;
      continue;
    }
    const docs = docsByFile.get(filePath) ?? [];
    if (docs.length === 1) return docs[0];
  }

  return null;
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
function makeRequirementNode(requirementId: string, _filePath: string, docString?: string): GraphNode {
  return {
    id: makeNodeId(`requirement:${requirementId}`, requirementId, 0),
    type: 'Requirement',
    name: requirementId,
    filePath: `requirement:${requirementId}`,
    startLine: 0,
    endLine: 0,
    signature: requirementId.split('-')[0],
    docString: docString?.slice(0, 500) ?? '',
  };
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
function groupParseRulesByLanguage(rules: ParseRule[]): Map<string, ParseRule[]> {
  const grouped = new Map<string, ParseRule[]>();
  for (const rule of rules) {
    const current = grouped.get(rule.language) ?? [];
    current.push(rule);
    grouped.set(rule.language, current);
  }
  return grouped;
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
function groupParseArtifactsByLanguage(artifacts: ParseArtifact[]): Map<string, ParseArtifact[]> {
  const grouped = new Map<string, ParseArtifact[]>();
  for (const artifact of artifacts) {
    const current = grouped.get(artifact.language) ?? [];
    current.push(artifact);
    grouped.set(artifact.language, current);
  }
  return grouped;
}

/**
 * Embedded docs extracted from code are only materialized when their file falls
 * under configured Doc Sources. Code Sources are for code indexing only.
 */
function filterDocSectionsBySources(
  sections: DocSection[],
  docSources?: DocSourceConfig[],
): DocSection[] {
  if (!sections.length) return sections;
  if (!docSources?.length) return [];
  return sections.filter((section) => matchesDocSources(section.filePath, docSources));
}

/**
 * Auto-documented structural element.
 */
function matchesDocSources(
  filePath: string,
  docSources: DocSourceConfig[],
): boolean {
  const absFilePath = resolve(filePath);
  return docSources.some((source) => {
    const rawPath = source.path.trim();
    if (!rawPath) return false;
    const cleaned = rawPath
      .replace(/\/\*\*.*$/, '')
      .replace(/\*.*$/, '')
      .replace(/\/$/, '')
      .trim();
    if (!cleaned) return false;
    const absSourcePath = resolve(cleaned);
    return absFilePath === absSourcePath || absFilePath.startsWith(absSourcePath + '/');
  });
}

/**
 * Resolves pending calls (callee names unresolved within a single file) by
 * looking them up in the DB after all files have been indexed.
 *
 * If a callee name matches multiple symbols (e.g. overloaded functions or
 * same-named functions in different files), we create edges to all of them.
 * Callers of built-in / external names that don't exist in the DB are silently
 * dropped.
 */
function resolvePendingCalls(db: GraphDB, pending: PendingCall[]): number {
  // Deduplicate to avoid redundant DB lookups
  const unique = new Map<string, Set<string>>(); // calleeName → Set<callerId>
  for (const { callerId, calleeName } of pending) {
    const set = unique.get(calleeName) ?? new Set();
    set.add(callerId);
    unique.set(calleeName, set);
  }

  let created = 0;
  for (const [calleeName, callerIds] of unique) {
    const callees = db.getSymbolByName(calleeName);
    if (callees.length === 0) continue;

    for (const callerId of callerIds) {
      for (const callee of callees) {
        if (callerId === callee.id) continue;
        const edgeId = `${callerId}->CALLS->${callee.id}`;
        db.upsertEdge({ id: edgeId, type: 'CALLS', sourceId: callerId, targetId: callee.id });
        created++;
      }
    }
  }
  return created;
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
function printSummary(s: IndexSummary): void {
  const elapsed = (s.elapsedMs / 1000).toFixed(1);
  const lines = [
    `\n  ┌─ Index complete ─────────────────`,
    `  │  Code files : ${s.codeFiles} (${s.skipped} skipped, ${s.errors} errors)`,
    `  │  Doc files  : ${s.docFiles}`,
    `  │  Nodes      : ${s.nodes}`,
    `  │  Edges      : ${s.edges}`,
    `  │  Clusters   : ${s.clusters}`,
    `  │  Time       : ${elapsed}s`,
    `  └──────────────────────────────────`,
  ];
  console.log(lines.join('\n'));
}
